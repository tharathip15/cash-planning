const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {rawReportRuntime}=require('./helpers/raw-reports.cjs');
function setup(){
 const r=rawReportRuntime(),c=r.context,stored={};
 Object.assign(c,{localStorage:{getItem:k=>stored[k]??null,setItem:(k,v)=>stored[k]=v,removeItem:k=>delete stored[k]},window:{cashReady:true},data:[],arInvoices:[],arPending:{},amount:r=>r.receipt?.actualAmount??r.amount,save:()=>{},arStorePending:()=>{},updateArBadge:()=>{},arSave:()=>true,arDefault:()=>'',bangkokToday:()=> '2026-10-30'});
 vm.runInContext(fs.readFileSync('public/counterparty-fields.js','utf8'),c);
 const debt=fs.readFileSync('public/debtor-status.js','utf8');vm.runInContext(debt.split('// Boot is separate')[0],c);
 c.seed=require('../public/debtor-status-seed.json').rows;vm.runInContext('debtorStatusSeed=seed;debtorSeedLoaded=true',c);
 const source=fs.readFileSync('public/receivables-sync.js','utf8');vm.runInContext(source.split('// Boot:')[0],c);
 const ar=fs.readFileSync('public/ar.js','utf8');
 vm.runInContext(ar.slice(ar.indexOf('function arPaid('),ar.indexOf('function arDefault(')),c);
 vm.runInContext(ar.slice(ar.indexOf('function syncAllArPlans('),ar.indexOf('function arTasks(')),c);
 return {c,stored};
}
function snapshot(){return {asOf:'2026-10-30',credit:{rows:[[1,'โปรเฟส','C1','Customer','',30]]},rawSources:{ar:{asOf:'2026-10-30',rows:[{company:'โปรเฟส',code:'C1',name:'Customer',bill:'B1',date:'2026-09-01',due:'2026-10-01',balance:600}]},sales:{rows:[{company:'โปรเฟส',code:'C1',name:'Customer',bill:'B1',date:'2026-09-01',amount:1000,credit:30}]}}}}

test('all five PDF groups are retained, including company codes, signed values and distinct OD totals',()=>{
 const {c}=setup();assert.deepEqual(c.seed.reduce((a,r)=>(a[r.group]=(a[r.group]||0)+1,a),{}),{1:12,2:2,3:10,4:7,5:7});
 assert.equal(c.debtorCompany('โปรเฟส'),'PF');assert.equal(c.debtorCompany('Novat'),'NV');
 assert.equal(c.seed.find(r=>r.id==='pdf-3-10').documentTotal,938818);
 assert.equal(c.seed.find(r=>r.id==='pdf-3-10').documentOD60,502311.5);
 assert.ok(c.seed.some(r=>r.documentTotal<0));
});
test('status is company/customer scoped; moving outstanding does not alter sales or raw AR',()=>{
 const {c}=setup();c.view='report-monthly';vm.runInContext(fs.readFileSync('public/reports.js','utf8'),c);
 c.fixture={monthly:{columns:Array.from({length:12},(_,i)=>({key:'c'+i})),months:[{key:'256909',sales:8,outstanding:9}]}};
 vm.runInContext("reportData=fixture;reportState.monthly.from='256909';reportState.monthly.to='256909'",c);
 const row=[1,'โปรเฟส','C1','','Customer','',30,95.79,1000,600,1000,600];
 c.saveDebtorStatus('PF','C1','Customer','3','เคลมประกัน');
 assert.equal(c.reportValue(row,'c8','monthly'),1000);assert.equal(c.reportValue(row,'c9','monthly'),0);assert.equal(c.reportValue(row,'c11','monthly'),0);
 assert.equal(row[9],600);assert.equal(c.debtorExcluded('NV','C1','Customer'),false);
 c.saveDebtorStatus('PF','C1','Customer','4','ติดตาม');assert.equal(c.reportValue(row,'c9','monthly'),600);
});
test('source AR creates complete current-bill details without inventing delivery dates or cash receipts',()=>{
 const {c}=setup(),d=snapshot();d.rawSources.ar.rows.push({company:'โปรเฟส',code:'C1',name:'Customer',bill:'CN1',date:'2026-09-01',balance:-20});
 const model=c.sourceReceivableModel(d,[]);assert.equal(model.invoices.length,1);assert.equal(model.adjustments.length,1);
 const invoice=model.invoices[0];assert.equal(invoice.amount,1000);assert.equal(invoice.priorPaid,400);assert.equal(invoice.promiseDate,'');assert.equal(invoice.shipmentDate,'');assert.equal(invoice.deliveryNo,'');
 c.arInvoices=model.invoices;c.syncAllArPlans();assert.equal(c.data.length,1);assert.equal(c.data[0].date,'');assert.equal(c.data[0].planExcluded,true);assert.equal(c.data[0].certainty,'uncertain');
});
test('receivable shipment, invoice date and SO/SS are separate fields from the sales source',()=>{
 const {c}=setup(),d=snapshot();Object.assign(d.rawSources.sales.rows[0],{shipmentDate:'2026-08-30',invoiceDate:'2026-09-01',deliveryNo:'SO-123'});
 const invoice=c.sourceReceivableModel(d,[]).invoices[0];assert.equal(invoice.shipmentDate,'2026-08-30');assert.equal(invoice.sourceDocDate,'2026-09-01');assert.equal(invoice.deliveryNo,'SO-123');
 assert.equal(c.sourceInvoiceLocked('sourceDocDate',invoice),true);
});
test('clearing a matched customer status does not resurrect the historical PDF classification',()=>{
 const {c}=setup(),d=snapshot(),seed=c.seed.find(r=>r.group==='3');
 d.rawSources.ar.rows[0].name=seed.name;d.credit.rows[0][3]=seed.name;
 assert.ok(c.debtorReportEntries(d).some(r=>r.code==='C1'));
 c.saveDebtorStatus('PF','C1',seed.name,'','');
 assert.equal(c.debtorReportEntries(d).some(r=>r.name===seed.name),false);
});
test('appointment changes update one linked income; reimport never duplicates that invoice',()=>{
 const {c}=setup(),d=snapshot();c.arInvoices=c.sourceReceivableModel(d,[]).invoices;c.syncAllArPlans();
 const id=c.data[0].id;c.arInvoices[0].promiseDate='2026-11-15';c.syncAllArPlans();assert.equal(c.data[0].date,'2026-11-15');assert.equal(c.data[0].planExcluded,false);
 c.arInvoices[0].promiseDate='2026-11-20';c.syncAllArPlans();assert.equal(c.data[0].id,id);assert.equal(c.data.length,1);assert.equal(c.data[0].date,'2026-11-20');
 const edits={[c.arInvoices[0].id]:{promiseDate:'2026-11-20'}};
 c.arInvoices=c.sourceReceivableModel(d,c.arInvoices,edits,c.data).invoices;c.syncAllArPlans();assert.equal(c.arInvoices.length,1);assert.equal(c.data.length,1);assert.equal(c.data[0].date,'2026-11-20');
});
test('receipts already included in snapshot are not subtracted again, including after reimport',()=>{
 const {c}=setup(),d=snapshot();c.arInvoices=c.sourceReceivableModel(d,[]).invoices;const invoice=c.arInvoices[0];
 c.data=[{id:1,type:'in',arInvoiceId:invoice.id,certainty:'received',amount:200,date:'2026-10-29'},{id:2,type:'in',arInvoiceId:invoice.id,certainty:'received',amount:100,date:'2026-11-01'}];
 assert.equal(c.arOutstanding(invoice),500);c.syncAllArPlans();assert.equal(c.data.filter(r=>r.certainty==='received').length,2);
 d.rawSources.ar.asOf='2026-11-01';d.rawSources.ar.rows[0].balance=500;
 c.arInvoices=c.sourceReceivableModel(d,c.arInvoices,{},c.data).invoices;assert.equal(c.arOutstanding(c.arInvoices[0]),500);
});
test('source storage saves small edits instead of duplicate derived invoices and retains receipt-linked archives',()=>{
 const {c,stored}=setup(),d=snapshot();const invoice=c.sourceReceivableModel(d,[]).invoices[0];invoice.promiseDate='2026-11-15';
 c.persistSourceAr([invoice]);assert.equal(JSON.parse(stored['profess-ar-v1']).length,0);
 assert.equal(JSON.parse(stored['profess-source-ar-edits-v1']).edits[invoice.id].promiseDate,'2026-11-15');
 d.rawSources.ar.rows=[];const model=c.sourceReceivableModel(d,[invoice],{},[{arInvoiceId:invoice.id,certainty:'received'}]);
 assert.equal(model.invoices[0].sourceArchived,true);assert.equal(model.invoices[0].priorPaid,1000);
});
test('income without an appointment explains due dates independently and stays out of dated cash plans',()=>{
 const {c}=setup(),d=snapshot();c.reportData=d;c.arInvoices=c.sourceReceivableModel(d,[]).invoices;c.syncAllArPlans();c.arDate=value=>value;
 const row=c.data[0];assert.equal(row.date,'');assert.equal(row.sourceDueDate,'2026-10-01');assert.equal(row.planExcluded,true);
 assert.match(c.sourceIncomeDateContext(row),/2026-10-01/);assert.match(c.sourceIncomeDateContext(row),/เกินกำหนด 29 วัน/);
 row.sourceDueDate='2026-11-01';assert.match(c.sourceIncomeDateContext(row),/ยังไม่ถึงกำหนด/);
 c.rangeStart='2026-10-01';c.rangeEnd='2026-10-31';c.sheetTable=()=>'<table></table>';
 assert.equal(c.sourceIncomeRows().length,0);
 const html=c.sourceIncomeTable([row]);assert.match(html,/บิลรอนัด · ไปติดตามหนี้/);assert.doesNotMatch(html,/income-date-group/);
});
test('Statement confirmation links to debt and later source reimport reconciles without deducting twice',()=>{
 const {c}=setup(),d=snapshot();c.reportData=d;c.rangeStart='2026-10-01';c.rangeEnd='2026-10-31';c.arInvoices=c.sourceReceivableModel(d,[]).invoices;c.arInvoices[0].promiseDate='2026-10-31';c.syncAllArPlans();
 const cash=c.data[0];assert.equal(c.sourceIncomeRows().length,1);Object.assign(cash,{certainty:'received',date:'2026-10-31',actualAmount:200,receipt:{actualDate:'2026-10-31',actualAmount:200,receiptNo:'R1'}});c.syncAllArPlans();
 assert.equal(c.arOutstanding(c.arInvoices[0]),400);assert.equal(c.sourceReceiptMatch(cash).status,'waiting');
 d.rawSources.ar.asOf='2026-10-31';d.rawSources.ar.rows[0].balance=400;d.rawSources.receipts={rows:[{company:'PF',code:'C1',bill:'B1',receivedDate:'2026-10-31',received:200,receiptNo:'R1'}]};
 c.arInvoices=c.sourceReceivableModel(d,c.arInvoices).invoices;c.syncAllArPlans();assert.equal(c.arOutstanding(c.arInvoices[0]),400);assert.equal(c.sourceReceiptMatch(cash).status,'matched');assert.equal(c.data.filter(row=>row.certainty==='received').length,1);
 const reconciliation=c.sourceReconciliationRows();assert.equal(reconciliation.length,1);assert.equal(reconciliation[0].status,'matched');
});
test('tracking tabs separate unplanned, scheduled and settled invoices',()=>{
 const {c}=setup(),d=snapshot();c.arInvoices=c.sourceReceivableModel(d,[]).invoices;const invoice=c.arInvoices[0];
 vm.runInContext("sourceArTab='unplanned'",c);assert.equal(c.sourceTrackingVisible(invoice),true);
 invoice.promiseDate='2026-11-01';assert.equal(c.sourceTrackingVisible(invoice),false);vm.runInContext("sourceArTab='scheduled'",c);assert.equal(c.sourceTrackingVisible(invoice),true);
 invoice.priorPaid=invoice.amount;assert.equal(c.sourceTrackingVisible(invoice),false);
});
test('receipt matching rejects ambiguity, different companies and mismatched dates; file-only rows never confirm cash',()=>{
 const {c}=setup(),d=snapshot();c.reportData=d;c.rangeStart='2026-10-01';c.rangeEnd='2026-10-31';c.arInvoices=c.sourceReceivableModel(d,[]).invoices;
 const invoice=c.arInvoices[0],cash={id:1,type:'in',certainty:'received',arInvoiceId:invoice.id,date:'2026-10-25',actualAmount:200};c.data=[cash];
 const row={company:'NV',code:'C1',bill:'B1',receivedDate:'2026-10-25',received:200};d.rawSources.receipts={rows:[row]};assert.equal(c.sourceReceiptMatch(cash).status,'waiting');
 row.company='PF';assert.equal(c.sourceReceiptMatch(cash).status,'matched');d.rawSources.receipts.rows.push({...row});assert.equal(c.sourceReceiptMatch(cash).status,'review');
 d.rawSources.receipts.rows=[{...row,receivedDate:'2026-10-24'}];assert.equal(c.sourceReceiptMatch(cash).status,'review');
 c.data=[];const result=c.sourceReconciliationRows();assert.equal(result[0].status,'file_only');assert.equal(c.data.length,0);assert.equal(c.arOutstanding(invoice),600);
});
test('invoice settlement history is company scoped and does not subtract imported receipts twice',()=>{
 const {c}=setup(),d=snapshot();
 d.rawSources.receipts={rows:[{company:'โปรเฟส',code:'C1',bill:'B1',receivedDate:'2026-10-20',received:400,receiptNo:'R1'},{company:'NV',code:'C1',bill:'B1',receivedDate:'2026-10-20',received:999,receiptNo:'NV1'}]};
 c.reportData=d;c.arInvoices=c.sourceReceivableModel(d,[]).invoices;const invoice=c.arInvoices[0];
 assert.equal(c.sourceSettlementRows(invoice).length,1);assert.equal(c.sourceSettlementRows(invoice)[0].receiptNo,'R1');assert.equal(c.arOutstanding(invoice),600);assert.equal(c.data.length,0);
 c.data=[{id:1,type:'in',certainty:'received',arInvoiceId:invoice.id,date:'2026-11-01',amount:100}];
 assert.equal(c.sourceSettlementRows(invoice).length,2);assert.equal(c.arOutstanding(invoice),500);assert.match(c.sourceSettlementSummary(invoice),/จะไม่หักซ้ำ/);
});
