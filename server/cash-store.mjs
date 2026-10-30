import postgres from 'postgres';
import { buildProjection, cashError, digest, mergeStorage, validateMutation } from './cash-model.mjs';

export function database(url) {
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !/^pfig_central_(production|cash_test_[a-f0-9]+)$/.test(parsed.pathname.slice(1))) throw Error('INVALID_CASH_DATABASE');
  return postgres(url, { max: 3, prepare: false, connect_timeout: 8, idle_timeout: 20, onnotice() {} });
}
export async function verifyDatabase(sql) {
  const [identity] = await sql`select current_database() as database, current_user as role, exists(select 1 from pfig_cash.workspaces where id='main') as seeded`;
  if (!/^pfig_central_(production|cash_test_[a-f0-9]+)$/.test(identity.database) || !identity.seeded) throw Error('CASH_DATABASE_NOT_SEEDED');
  return identity;
}
export async function projectStorage(tx, storage) {
  const [asset] = await tx`select payload from pfig_cash.assets where name='data.json'`;
  const projection = buildProjection(storage, asset.payload);
  for (const name of ['customers', 'sales_lines', 'receivable_bills', 'receipt_lines', 'companies', 'cash_entries']) {
    await tx.unsafe(`delete from pfig_cash.${name}`);
  }
  if (projection.companies.length) await tx`insert into pfig_cash.companies select * from jsonb_to_recordset(${tx.json(projection.companies)}) as x(code text,name text)`;
  if (projection.customers.length) await tx`insert into pfig_cash.customers select * from jsonb_to_recordset(${tx.json(projection.customers)}) as x(company text,customer_code text,name text,details jsonb)`;
  for (const [name, rows] of [['sales_lines', projection.sales], ['receivable_bills', projection.receivables], ['receipt_lines', projection.receipts]]) {
    if (rows.length) await tx.unsafe(`insert into pfig_cash.${name} select * from jsonb_to_recordset($1::jsonb) as x(source_row integer,company text,customer_code text,bill_no text,document_date text,amount numeric,details jsonb)`, [tx.json(rows)]);
  }
  if (projection.cashEntries.length) await tx`insert into pfig_cash.cash_entries select * from jsonb_to_recordset(${tx.json(projection.cashEntries)}) as x(id text,document_date text,type text,amount numeric,details jsonb)`;
  return Object.fromEntries(Object.entries(projection).map(([name, rows]) => [name, rows.length]));
}
export function createStore(sql) {
  return {
    async read(revision) {
      return sql.begin('isolation level repeatable read read only', async tx => {
        const [row] = await tx`select revision,storage,updated_at from pfig_cash.workspaces where id='main'`;
        if (!row) throw cashError(503, 'WORKSPACE_NOT_SEEDED');
        if (revision === row.revision) return { revision: row.revision, unchanged: true };
        const assets = Object.fromEntries((await tx`select name,payload from pfig_cash.assets`).map(asset => [asset.name, asset.payload]));
        assets['reports-data.json'] = JSON.parse(row.storage['profess-reports-v1']);
        return { schema: 1, revision: row.revision, storage: row.storage, assets, updatedAt: row.updated_at };
      });
    },
    async write(input) {
      const body = validateMutation(input), hash = digest(body);
      return sql.begin(async tx => {
        const [row] = await tx`select revision,storage from pfig_cash.workspaces where id='main' for update`;
        if (!row) throw cashError(503, 'WORKSPACE_NOT_SEEDED');
        const [receipt] = await tx`select revision,request_hash from pfig_cash.workspace_events where request_id=${body.requestId}`;
        if (receipt) {
          if (receipt.request_hash !== hash) throw cashError(409, 'REQUEST_ID_REUSED');
          return { revision: receipt.revision, replayed: true };
        }
        if (row.revision !== body.revision) throw Object.assign(cashError(409, 'VERSION_CONFLICT'), { revision: row.revision });
        const next = mergeStorage(row.storage, body.changes), revision = row.revision + 1;
        // Validation and all read models are committed together with the workspace.
        if (Object.keys(body.changes).some(key => ['profess-reports-v1', 'profess-added-v1', 'profess-edits-v2'].includes(key))) await projectStorage(tx, next);
        const before = Object.fromEntries(Object.keys(body.changes).map(key => [key, row.storage[key] ?? null]));
        await tx`update pfig_cash.workspaces set revision=${revision},storage=${tx.json(next)},updated_at=now() where id='main'`;
        await tx`insert into pfig_cash.workspace_events(request_id,client_id,revision,request_hash,changed_keys,before_values,after_values)
          values(${body.requestId},${body.clientId},${revision},${hash},${Object.keys(body.changes)},${tx.json(before)},${tx.json(body.changes)})`;
        return { revision };
      });
    },
  };
}
