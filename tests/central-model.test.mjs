import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readSeed } from '../server/cash-install.mjs';
import { buildProjection, decodeReport, validateMutation, mergeStorage } from '../server/cash-model.mjs';
import { createCashHandler } from '../server/cash-http.mjs';
import { proxyCash } from '../server/cash-proxy.mjs';

const seed = await readSeed();
test('migration retains company boundaries, all source rows and signed receipts', () => {
  const p = buildProjection(seed.storage, seed.assets['data.json']);
  assert.deepEqual(p.companies.map(r=>r.code).sort(), ['Novat','TNP','โปรเฟส'].sort());
  assert.equal(p.customers.length,501); assert.equal(p.sales.length,5956); assert.equal(p.receivables.length,1404); assert.equal(p.receipts.length,5865); assert.equal(p.cashEntries.length,94);
  assert.ok(p.receipts.some(row=>row.amount<0));
  const report = decodeReport(seed.storage['profess-reports-v1']);
  assert.ok(Math.abs(p.receivables.reduce((n,r)=>n+r.amount,0)-report.checks.allAr)<.01);
  assert.ok(Math.abs(p.sales.reduce((n,r)=>n+r.amount,0)-report.checks.sales)<.01);
});
test('invalid source values and cross-company duplicate identities fail before persistence', () => {
  const report = decodeReport(seed.storage['profess-reports-v1']);
  const copied = structuredClone(report); copied.rawSources.ar.rows.push(copied.rawSources.ar.rows[0]);
  assert.throws(()=>buildProjection({...seed.storage,'profess-reports-v1':JSON.stringify(copied)},seed.assets['data.json']),/DUPLICATE_RECEIVABLE/);
  copied.rawSources.ar.rows.pop();copied.rawSources.sales.rows[0].amount='NaN';
  assert.throws(()=>buildProjection({...seed.storage,'profess-reports-v1':JSON.stringify(copied)},seed.assets['data.json']),/INVALID_MONEY/);
});
test('unrecognized storage keys, missing reports and malformed mutation IDs are rejected', () => {
  const body={revision:1,requestId:randomUUID(),clientId:randomUUID(),changes:{'profess-edits-v2':'{}'}};
  assert.equal(validateMutation(body),body);
  assert.throws(()=>validateMutation({...body,changes:{'other-app-secret':'x'}}),/INVALID_CHANGES/);
  assert.throws(()=>validateMutation({...body,revision:0}),/INVALID_MUTATION/);
  assert.throws(()=>mergeStorage(seed.storage,{'profess-reports-v1':null}),/REPORT_REQUIRED/);
});
test('central service enforces the bridge secret, origin, custom header and route restrictions', async () => {
  let writes=0;
  const key='s'.repeat(64), handler=createCashHandler({key,allowedOrigins:['https://cash.test'],store:{read:async()=>({revision:1}),write:async()=>{writes++;return {revision:2}}}});
  assert.equal((await handler(new Request('http://central/api/cash/workspace'))).status,401);
  assert.equal((await handler(new Request('http://central/sql',{headers:{'x-cash-backend-key':key}}))).status,404);
  for(const origin of ['https://evil.test','null']) {
    assert.equal((await handler(new Request('http://central/api/cash/workspace',{method:'PUT',headers:{'x-cash-backend-key':key,origin,'Content-Type':'application/json','x-cash-client':'1'},body:'{}'}))).status,403);
  }
  assert.equal(writes,0);
  assert.equal((await handler(new Request('http://central/api/cash/workspace',{method:'PUT',headers:{'x-cash-backend-key':key,origin:'https://cash.test','Content-Type':'application/json','x-cash-client':'1'},body:'{}'}))).status,200);
});
test('public proxy does not accept a cross-origin write or leak secrets into the response', async () => {
  const settings={CASH_BACKEND_URL:'http://127.0.0.1:8792',CASH_BACKEND_KEY:'s'.repeat(64)};
  let fetched=0;
  const fetcher=async(url,options)=>{fetched++;assert.equal(options.headers['x-cash-backend-key'],settings.CASH_BACKEND_KEY);return Response.json({revision:1});};
  assert.equal((await proxyCash(new Request('https://cash.test/api/cash/workspace',{method:'PUT',headers:{origin:'https://evil.test','Content-Type':'application/json','x-cash-client':'1'},body:'{}'}),settings,fetcher)).status,403);
  assert.equal(fetched,0);
  const response=await proxyCash(new Request('https://cash.test/api/cash/workspace'),settings,fetcher);
  assert.equal(response.status,200); assert.equal(response.headers.get('x-cash-backend-key'),null);
  assert.deepEqual(await response.json(),{revision:1});
  assert.equal((await proxyCash(new Request('https://cash.test/api/cash/workspace'),{},fetcher)).status,503);
});
