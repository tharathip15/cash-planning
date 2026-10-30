// Explicit operator command. Additive only; never migrates an existing Cash schema.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import postgres from 'postgres';
import { readSeed, installTables } from '../server/cash-install.mjs';

const [runtimePath, destination, flag] = process.argv.slice(2);
if (!runtimePath || !destination || flag !== '--apply') throw Error('USAGE: node scripts/provision-central.mjs CENTRAL_RUNTIME PRIVATE_DIRECTORY --apply');
const privateDirectory = resolve(destination);
if (!privateDirectory.startsWith(resolve(process.env.USERPROFILE, '.codex/private-data') + '\\')) throw Error('PRIVATE_DIRECTORY_REQUIRED');
const settings = JSON.parse(await readFile(runtimePath, 'utf8')), endpoint = new URL(settings.databaseUrl);
if (endpoint.hostname !== '127.0.0.1' || endpoint.port !== '55445' || endpoint.pathname !== '/pfig_central_production' || settings.adminUser !== 'pfig_central_admin') throw Error('CENTRAL_PRODUCTION_IDENTITY_REQUIRED');
endpoint.username = settings.adminUser; endpoint.password = settings.adminPassword;
const sql = postgres(endpoint.href, { max: 1, prepare: false, onnotice() {} });
try {
  const [identity] = await sql`select product from pfig_core.storage_identity where id=1`;
  if (identity?.product !== 'PFIG_CENTRAL_V1') throw Error('WRONG_DATABASE');
  const [existing] = await sql`select exists(select 1 from pg_namespace where nspname='pfig_cash') as schema,
    exists(select 1 from pg_roles where rolname in ('pfig_cash_owner','pfig_cash_app')) as role`;
  if (existing.schema || existing.role) throw Error('CASH_ALREADY_EXISTS_REVIEW_REQUIRED');
  const seed = await readSeed(), password = randomBytes(36).toString('base64url'), backendKey = randomBytes(48).toString('base64url');
  await mkdir(privateDirectory, { recursive: true });
  // Save recovery credentials before committing DDL; never print them.
  const runtime = { port: 8792, databaseUrl: '', backendKey, allowedOrigins: ['http://localhost:3000', 'http://localhost:3001', 'https://cash-planning-mu.vercel.app'], createdAt: new Date().toISOString() };
  const appUrl = new URL(endpoint); appUrl.username = 'pfig_cash_app'; appUrl.password = password; runtime.databaseUrl = appUrl.href;
  await writeFile(join(privateDirectory, 'cash-runtime.secret.json'), JSON.stringify(runtime, null, 2), { flag: 'wx', mode: 0o600 });
  await writeFile(join(privateDirectory, 'backup-key.secret.json'), JSON.stringify({ keyHex: randomBytes(32).toString('hex') }), { flag: 'wx', mode: 0o600 });
  const counts = await sql.begin(async tx => {
    await tx.unsafe('create role pfig_cash_owner nologin nosuperuser nocreatedb nocreaterole noinherit');
    await tx.unsafe(`create role pfig_cash_app login password '${password}' nosuperuser nocreatedb nocreaterole noinherit`);
    const counts = await installTables(tx, seed);
    const forbidden = await tx`select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','pfig_core','pfig_hr') and c.relkind in ('r','p','v','m')
    and (has_table_privilege('pfig_cash_app',c.oid,'SELECT') or has_table_privilege('pfig_cash_app',c.oid,'INSERT') or has_table_privilege('pfig_cash_app',c.oid,'UPDATE') or has_table_privilege('pfig_cash_app',c.oid,'DELETE'))`;
    if (forbidden.length) throw Error('UNEXPECTED_CROSS_MODULE_ACCESS');
    return counts;
  });
  const report = { schema: 'pfig_cash', role: 'pfig_cash_app', counts, noCrossModuleTableAccess: true, createdAt: runtime.createdAt };
  await writeFile(join(privateDirectory, 'installation.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
} finally { await sql.end(); }
