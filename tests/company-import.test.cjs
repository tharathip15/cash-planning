const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {rawReportRuntime}=require('./helpers/raw-reports.cjs');
function setup(){
 const r=rawReportRuntime(),c=r.context,elements=new Map();
 c.$=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,innerHTML:'',insertAdjacentHTML(){}});return elements.get(id)};
 c.document={body:{insertAdjacentHTML(){}},querySelectorAll:()=>[]};c.arInvoices=[];c.arPending={};
 const companies=['โปรเฟส','Novat','TNP'],rawSources={};
 for(const kind of ['sales','ar','receipts'])rawSources[kind]={asOf:'2026-10-01',file:kind,rows:kind==='receipts'?[]:companies.map(company=>({company,code:'C1',name:company,bill:'B1',date:'2026-09-01',due:'2026-09-30',amount:100,balance:40,credit:30}))};
 c.reportData={...c.rrBuild(rawSources.sales.rows,rawSources.ar.rows,[],[],2569,'2026-10-01'),rawSources};
 const raw=fs.readFileSync('public/reports-raw.js','utf8');vm.runInContext(raw.slice(raw.indexOf('document.body.insertAdjacentHTML')),c);vm.runInContext(fs.readFileSync('public/reports-links.js','utf8'),c);
 for(const kind of ['sales','ar','receipts'])r.setInput(kind,{...c.rrSavedInput(kind)});
 c.$('#rr-year').value='2569';c.$('#rr-asof').value='2026-10-30';c.$('#rr-scope').value='both';
 return {...r,c};
}
test('new AR upload replaces NV company only, including removed bills, without duplicating PF/TNP',()=>{
 const {c,XLSX,setInput,schemas}=setup(),book=XLSX.utils.book_new();
 const row={company:'NV',code:'C1',name:'Novat',bill:'B2',date:'2026-09-01',due:'2026-10-01',balance:25};
 XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([schemas.ar.map(f=>f[1]),schemas.ar.map(f=>row[f[0]]??'')]),'AR');
 setInput('ar',{book,sheet:'AR',filename:'new-nv.xlsx',company:'NV'});vm.runInContext("rrAutoMap('ar')",c);c.rrPreview();
 assert.equal(c.$('#rr-error').textContent,'');const next=vm.runInContext('rrPlan',c);
 assert.equal(next.rawSources.ar.rows.length,3);assert.equal(next.rawSources.ar.rows.find(r=>r.company==='Novat').bill,'B2');
 assert.equal(next.rawSources.ar.rows.find(r=>r.company==='โปรเฟส').balance,40);assert.equal(next.rawSources.ar.rows.find(r=>r.company==='TNP').snapshotAsOf,'2026-10-01');
 assert.equal(next.rawSources.ar.rows.find(r=>r.company==='Novat').snapshotAsOf,'2026-10-30');
 c.reportData=next;c.rrPreview();assert.equal(vm.runInContext('rrPlan.rawSources.ar.rows.length',c),3);
 assert.equal(vm.runInContext('rrPlan.credit.rows.length',c),3);
});
test('company aliases match while matching bill/customer codes remain separate across companies',()=>{
 const c=rawReportRuntime().context;
 const rows=c.rrMergeCompanyRows([{company:'PF',bill:'old'},{company:'NV',bill:'keep'},{company:'TNP',bill:'keep'}],[{company:'โปรเฟส',bill:'new'}],'2026-10-01','2026-10-30');
 assert.equal(rows.length,3);assert.ok(!rows.some(r=>r.bill==='old'));assert.equal(rows.find(r=>r.company==='โปรเฟส').bill,'new');
 assert.throws(()=>c.rrMergeCompanyRows(rows,[{company:'ไม่ระบุบริษัท'}],'',''),/ระบุบริษัท/);
});
test('live receipts use each company bill snapshot date instead of the newest import date',()=>{
 const {c}=setup();const link={asOf:'2026-10-30',bills:[{company:'PF',code:'C1',bill:'B1',date:'2026-09-01',balance:40,snapshotAsOf:'2026-10-01'},{company:'NV',code:'C1',bill:'B1',date:'2026-09-01',balance:40,snapshotAsOf:'2026-10-30'}]};
 const invoices=[{id:'PF',sourceCompany:'PF',sourceCustomerCode:'C1',billNo:'B1'},{id:'NV',sourceCompany:'NV',sourceCustomerCode:'C1',billNo:'B1'}],cash=invoices.map(i=>({arInvoiceId:i.id,type:'in',certainty:'received',date:'2026-10-15',amount:10}));
 const reductions=c.reportReceiptReductions(link,cash,invoices);assert.equal(reductions.get(vm.runInContext("rrKey('PF','C1')",c)).total,10);assert.equal(reductions.has(vm.runInContext("rrKey('NV','C1')",c)),false);
});
test('existing NV workspace recovers missing PF and TNP without replacing edited NV balances',()=>{
 const c=rawReportRuntime().context,bundled=c.reportDeserializeSnapshot(fs.readFileSync('public/reports-data.json','utf8')),stored=structuredClone(bundled);
 for(const source of Object.values(stored.rawSources))source.rows=source.rows.filter(r=>r.company==='Novat');
 stored.rawSources.ar.rows[0].balance=1;stored.monthly.rows=stored.monthly.rows.filter(r=>r[1]==='Novat');stored.credit.rows=stored.credit.rows.filter(r=>r[1]==='Novat');
 const next=c.reportChooseInitial(bundled,stored);
 assert.equal(next.monthly.rows.length,501);assert.equal(next.rawSources.ar.rows.find(r=>r.company==='Novat').balance,1);
 assert.equal(stored.rawSources.ar.rows.length,89);assert.equal(c.reportChooseInitial(bundled,next),next);
 const values={'profess-reports-v1':c.reportSerializeSnapshot(stored)};
 c.localStorage={getItem:key=>values[key]??null,setItem:(key,value)=>values[key]=value,removeItem:key=>delete values[key]};
 c.reportChooseAndStoreInitial(bundled,stored);
 assert.equal(c.reportDeserializeSnapshot(values['profess-reports-v1']).monthly.rows.length,501);
 assert.equal(c.reportDeserializeSnapshot(values['profess-reports-backup-v1']).monthly.rows.length,34);
});
test('loading a workspace never resurrects cleared AR for a company still present in sales',()=>{
 const c=rawReportRuntime().context,bundled=c.reportDeserializeSnapshot(fs.readFileSync('public/reports-data.json','utf8')),stored=structuredClone(bundled);
 stored.rawSources.ar.rows=stored.rawSources.ar.rows.filter(r=>r.company!=='Novat');
 assert.equal(c.reportChooseInitial(bundled,stored),stored);
});
