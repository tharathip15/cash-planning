import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBackend,validateBackend } from '../server/cash-discovery.mjs';

test('runtime discovery reads only the trusted configuration host and retains a short cache',async()=>{
  let calls=0,value='https://one-test.trycloudflare.com';
  const settings={CASH_BACKEND_DISCOVERY_URL:'https://edge-config.vercel.com/ecfg_testCache/item/cashBackendUrl?token=test-read-only'};
  const fake=async()=>{calls++;return Response.json(value);};
  assert.equal((await resolveBackend(settings,fake,1000)).origin,value);
  value='https://two-test.trycloudflare.com';
  assert.equal((await resolveBackend(settings,fake,9000)).origin,'https://one-test.trycloudflare.com');assert.equal(calls,1);
  assert.equal((await resolveBackend(settings,fake,17000)).origin,value);assert.equal(calls,2);
});
test('discovery rejects redirects, unexpected hosts and localhost/private target URLs',async()=>{
  for(const value of ['http://127.0.0.1:8792','https://evil.test','https://ok.trycloudflare.com@evil.test/','https://ok.trycloudflare.com/path'])assert.throws(()=>validateBackend(value,true));
  await assert.rejects(resolveBackend({CASH_BACKEND_DISCOVERY_URL:'https://evil.test/item?token=x'},async()=>{throw Error('should not fetch');}),/INVALID_DISCOVERY/);
  await assert.rejects(resolveBackend({CASH_BACKEND_DISCOVERY_URL:'https://edge-config.vercel.com/ecfg_failed/item/cashBackendUrl?token=test-read-only'},async()=>new Response('',{status:503})),/UNAVAILABLE/);
});
test('loopback development keeps its explicit local endpoint and never requires discovery credentials',async()=>{
  assert.equal((await resolveBackend({CASH_BACKEND_URL:'http://127.0.0.1:8792'},async()=>{throw Error('should not fetch');})).origin,'http://127.0.0.1:8792');
  assert.throws(()=>validateBackend('http://10.0.0.1:8792'));
});
