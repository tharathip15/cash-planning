import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { readSeed, installTables } from '../server/cash-install.mjs';
import { createStore } from '../server/cash-store.mjs';

test('real PostgreSQL migration, permissions, concurrency, retry and transaction rollback', {skip:!process.env.CASH_CENTRAL_RUNTIME_FILE}, async t => {
  const config=JSON.parse(await readFile(process.env.CASH_CENTRAL_RUNTIME_FILE,'utf8'));
  const url=new URL(config.databaseUrl);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55445');assert.equal(url.pathname,'/pfig_central_production');
  url.username=config.adminUser;url.password=config.adminPassword;
  const admin=postgres(url.href,{max:1,prepare:false,onnotice(){}}), suffix=randomBytes(6).toString('hex');
  const name='pfig_central_cash_test_'+suffix, owner='cash_test_owner_'+suffix, role='cash_test_app_'+suffix, password=randomBytes(24).toString('hex');
  let db,app,created=false;
  try {
    assert.equal((await admin`select product from pfig_core.storage_identity where id=1`)[0].product,'PFIG_CENTRAL_V1');
    await admin.unsafe(`create database ${name}`);created=true;
    const testUrl=new URL(url);testUrl.pathname='/'+name;db=postgres(testUrl.href,{max:1,prepare:false,onnotice(){}});
    await db.begin(async tx=>{
      await tx.unsafe(`create role ${owner} nologin; create role ${role} login password '${password}' noinherit;`);
      await installTables(tx,await readSeed(),owner,role);
      await tx`create table public.other_module_secret(value text)`;
    });
    testUrl.username=role;testUrl.password=password;app=postgres(testUrl.href,{max:3,prepare:false,onnotice(){}});
    const store=createStore(app);
    await t.test('all bundled rows migrate and SQL totals reconcile',async()=>{
      assert.equal(Number((await app`select count(*) as n from pfig_cash.sales_lines`)[0].n),5956);
      assert.equal(Number((await app`select count(*) as n from pfig_cash.receivable_bills`)[0].n),1404);
      assert.equal(Number((await app`select count(*) as n from pfig_cash.receipt_lines`)[0].n),5865);
      assert.equal(Number((await app`select count(*) as n from pfig_cash.customers`)[0].n),501);
      const report=JSON.parse((await store.read()).storage['profess-reports-v1']);
      assert.ok(Math.abs(Number((await app`select sum(amount) as n from pfig_cash.receivable_bills`)[0].n)-report.checks.allAr)<.01);
      assert.equal((await store.read(1)).unchanged,true);
    });
    await t.test('runtime cannot read another module, alter tables or change audit history',async()=>{
      await assert.rejects(app`select * from public.other_module_secret`,e=>e.code==='42501');
      await assert.rejects(app`create table pfig_cash.bad(value text)`,e=>e.code==='42501');
      await assert.rejects(app`delete from pfig_cash.workspace_events`,e=>e.code==='42501');
      await assert.rejects(app`update pfig_cash.assets set payload='{}'::jsonb`,e=>e.code==='42501');
    });
    await t.test('exact retry is idempotent and reusing the ID with another payload fails',async()=>{
      const body={revision:1,requestId:randomUUID(),clientId:randomUUID(),changes:{'profess-debtor-status-v1':'{}'}};
      assert.equal((await store.write(body)).revision,2);
      assert.equal((await store.write(body)).replayed,true);
      await assert.rejects(store.write({...body,changes:{'profess-customer-behavior-v1':'{}'}}),e=>e.code==='REQUEST_ID_REUSED');
      assert.equal((await store.read()).revision,2);
    });
    await t.test('two simultaneous saves cannot silently overwrite one another',async()=>{
      const make=()=>({revision:2,requestId:randomUUID(),clientId:randomUUID(),changes:{'profess-customer-behavior-v1':'{}'}});
      const results=await Promise.allSettled([store.write(make()),store.write(make())]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.code,'VERSION_CONFLICT');
      assert.equal((await store.read()).revision,3);
    });
    await t.test('database failure after read-model deletion rolls back every table and the revision',async()=>{
      const before=await store.read(),reports=JSON.parse(before.storage['profess-reports-v1']);reports.source='rollback-check';
      await db.unsafe(`revoke insert on pfig_cash.receipt_lines from ${role}`);
      try { await assert.rejects(store.write({revision:before.revision,requestId:randomUUID(),clientId:randomUUID(),changes:{'profess-reports-v1':JSON.stringify(reports)}}),e=>e.code==='42501'); }
      finally { await db.unsafe(`grant insert on pfig_cash.receipt_lines to ${role}`); }
      const after=await store.read();assert.equal(after.revision,before.revision);assert.equal(after.storage['profess-reports-v1'],before.storage['profess-reports-v1']);
      assert.equal(Number((await app`select count(*) as n from pfig_cash.receipt_lines`)[0].n),5865);
      assert.equal(Number((await app`select count(*) as n from pfig_cash.sales_lines`)[0].n),5956);
    });
    await t.test('a runtime cash save updates SQL details atomically without changing imported source totals',async()=>{
      const before=await store.read(),edits=JSON.parse(before.storage['profess-edits-v2']);
      edits['0']={...edits['0'],amount:104201.5,note:'disposable database only'};
      const added=[{id:100001,type:'in',date:'2026-11-01',amount:25.75,certainty:'received',receipt:{actualAmount:25.75}}];
      const body={revision:before.revision,requestId:randomUUID(),clientId:randomUUID(),changes:{'profess-edits-v2':JSON.stringify(edits),'profess-added-v1':JSON.stringify(added)}};
      const saved=await store.write(body);assert.equal(saved.revision,before.revision+1);
      assert.equal(Number((await app`select amount from pfig_cash.cash_entries where id='0'`)[0].amount),104201.5);
      assert.equal(Number((await app`select count(*) as n from pfig_cash.cash_entries`)[0].n),95);
      assert.equal((await store.read()).storage['profess-reports-v1'],before.storage['profess-reports-v1']);
      assert.equal((await store.write(body)).replayed,true);
      assert.equal(Number((await app`select count(*) as n from pfig_cash.cash_entries`)[0].n),95);
    });
  } finally {
    await app?.end();await db?.end();
    if(created) {assert.match(name,/^pfig_central_cash_test_[a-f0-9]+$/);await admin.unsafe(`drop database ${name} with (force)`);}
    for(const item of [role,owner]) {assert.match(item,/^cash_test_(app|owner)_[a-f0-9]+$/);await admin.unsafe(`drop role if exists ${item}`);}
    await admin.end();
  }
});
