const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {rawReportRuntime}=require('./helpers/raw-reports.cjs');
const source=()=>JSON.parse(fs.readFileSync('public/reports-data.json','utf8'));
test('bundled snapshot restores original PF source rows, reconciles totals and retains other company tables',()=>{
 const c=rawReportRuntime().context,d=c.reportDeserializeSnapshot(JSON.stringify(source()));
 assert.equal(d.datasetVersion,'all-companies-2026-10-30-v1');
 for(const [kind,count]of Object.entries({sales:5321,ar:1164,receipts:5374})){
  assert.equal(d.rawSources[kind].rows.filter(r=>r.company==='โปรเฟส').length,count);
 }
 const near=(a,b)=>assert.ok(Math.abs(a-b)<.01);
 near(d.rawSources.ar.rows.reduce((n,r)=>n+r.balance,0),d.checks.allAr);
 near(d.credit.rows.reduce((n,r)=>n+r[7],0),d.checks.allAr);
 near(d.monthly.rows.reduce((n,r)=>n+r.at(-2),0),d.checks.sales);
 for(const company of ['Novat','TNP'])assert.ok(d.credit.rows.some(r=>r[1]===company));
 assert.ok(d.monthly.rows.every(r=>r.length===d.monthly.columns.length));
 const november=d.monthly.months.find(m=>m.key==='256911');
 assert.ok(d.monthly.rows.filter(r=>r[1]!=='โปรเฟส').every(r=>r[november.sales]===0));
 assert.equal(d.monthly.rows.length,501);
});
test('fresh browsers decode bundled sources; returning browsers retain their own imports and can see an update',async()=>{
 for(const hasStored of [false,true]){
  const c=rawReportRuntime().context,stored={datasetVersion:'local-only',monthly:{months:[{key:'256901'}]},credit:{rows:[]}};
  c.view='overview';c.render=()=>{};c.fetch=async()=>({ok:true,json:async()=>source()});
  vm.runInContext(fs.readFileSync('public/reports.js','utf8'),c);c.reportStored=()=>hasStored?stored:null;
  await c.loadReports();
  const current=vm.runInContext('reportData',c),bundled=vm.runInContext('reportBundledData',c);
  assert.ok(Array.isArray(bundled.rawSources.ar.rows));
  assert.equal(c.reportBundledUpdateAvailable(bundled,current),hasStored);
  if(hasStored)assert.equal(current,stored);else assert.equal(current.datasetVersion,'all-companies-2026-10-30-v1');
 }
});
