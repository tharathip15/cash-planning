const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(hostname='127.0.0.1',search='?mode=test',saved){
 class Storage{constructor(){this.values={}}getItem(k){return this.values[k]??null}setItem(k,v){this.values[k]=String(v)}removeItem(k){delete this.values[k]}clear(){this.values={}}}
 const localStorage=new Storage();localStorage.setItem('profess-ar-v1','original');const calls=[],state={saved};
 const store={get(){return {result:state.saved}},put(value){state.saved=value;return {result:'current'}}};
 const db={transaction(){const tx={objectStore:()=>store};queueMicrotask(()=>tx.oncomplete());return tx}};
 const indexedDB={open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request}};
 const node=()=>({append(){},setAttribute(){},before(){}});
 const c=vm.createContext({Storage,localStorage,indexedDB,URLSearchParams,location:{hostname,search},window:{},document:{createElement:node,getElementById:node},setTimeout,clearTimeout,fetch:async url=>{calls.push(url);return {ok:true,json:async()=>({storage:{'profess-ar-v1':'seed-copy'}})}}});
 vm.runInContext(fs.readFileSync('public/test-store.js','utf8'),c);
 return {c,localStorage,calls,state};
}
test('explicit local test mode isolates edits, persists them and never calls central API',async()=>{
 const r=setup();await r.c.window.CashCentral.initialize();
 assert.equal(r.localStorage.getItem('profess-ar-v1'),'seed-copy');
 r.localStorage.setItem('profess-ar-v1','test-edit');await r.c.window.CashCentral.flush();
 assert.equal(r.localStorage.values['profess-ar-v1'],'original');assert.equal(r.state.saved.storage['profess-ar-v1'],'test-edit');
 const next=setup('127.0.0.1','?mode=test',r.state.saved);await next.c.window.CashCentral.initialize();assert.equal(next.localStorage.getItem('profess-ar-v1'),'test-edit');assert.equal(next.calls.length,0);
 await r.c.window.CashCentral.fetchAsset('data.json');assert.deepEqual(r.calls,['/workspace-snapshot.json','/data.json']);
 const denied=await r.c.window.CashCentral.fetchAsset('https://example.com');assert.equal(denied.ok,false);
});
test('production and implicit localhost loads cannot enable the test store',async()=>{
 for(const [host,query]of [['cash-planning-mu.vercel.app','?mode=test'],['127.0.0.1','']]){
  const r=setup(host,query);await assert.rejects(r.c.window.CashCentral.initialize(),/EXPLICIT_LOOPBACK/);assert.equal(r.localStorage.getItem('profess-ar-v1'),'original');assert.equal(r.calls.length,0);
 }
});
