const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {rawReportRuntime}=require('./helpers/raw-reports.cjs');
const snapshot=JSON.parse(fs.readFileSync('public/workspace-snapshot.json','utf8'));
function setup(initial={},failKey){
 const stored={...initial};let fetches=0;
 const c=vm.createContext({localStorage:{getItem:key=>stored[key]??null,setItem:(key,value)=>{if(key===failKey)throw Error('storage full');stored[key]=value},removeItem:key=>delete stored[key]},fetch:async()=>{fetches++;return {ok:true,json:async()=>snapshot}}});
 const source=fs.readFileSync('components/CashWorkspace.jsx','utf8');vm.runInContext(source.slice(source.indexOf('async function seedCurrentWorkspace'),source.indexOf('function boot()')),c);
 return {stored,c,fetches:()=>fetches};
}
test('fresh workspace seeds saved reports, cash edits and invoice appointments before boot',async()=>{
 const {c,stored}=setup();await c.seedCurrentWorkspace();
 assert.deepEqual(stored,snapshot.storage);
 const reports=rawReportRuntime().context.reportDeserializeSnapshot(stored['profess-reports-v1']);
 assert.equal(reports.monthly.rows.length,34);assert.equal(reports.credit.rows.length,34);
 assert.equal(reports.rawSources.sales.rows.length,252);assert.equal(reports.rawSources.ar.rows.length,89);assert.equal(reports.rawSources.receipts.rows.length,205);
 assert.ok(reports.monthly.rows.every(row=>row[1]==='Novat'));
 assert.equal(Object.keys(JSON.parse(stored['profess-edits-v2'])).length,94);
});
test('existing workspace data is preserved without fetching or mixing datasets',async()=>{
 const {c,stored,fetches}=setup({'profess-reports-v1':'existing'});await c.seedCurrentWorkspace();assert.equal(fetches(),0);assert.deepEqual(stored,{'profess-reports-v1':'existing'});
});
test('storage failure rolls back only newly seeded keys',async()=>{
 const {c,stored}=setup({'profess-ar-menu':'false'},'profess-edits-v2');await assert.rejects(c.seedCurrentWorkspace(),/storage full/);assert.deepEqual(stored,{'profess-ar-menu':'false'});
});
