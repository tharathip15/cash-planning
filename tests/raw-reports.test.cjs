const test = require('node:test');
const assert = require('node:assert/strict');
const {rawReportRuntime} = require('./helpers/raw-reports.cjs');

function source(runtime, kind, data) {
 const sheet = runtime.XLSX.utils.aoa_to_sheet(data);
 const input = {book:{Sheets:{Data:sheet},SheetNames:['Data']},sheet:'Data'};
 runtime.setInput(kind,input);
 runtime.context.rrAutoMap(kind);
 return {input, rows:()=>runtime.context.rrRead(kind)};
}
const salesHeaders=['Doc Date','Doc No','Customer No','Customer Name','CreditDay','Payment Due Date','Net Amount','Goods No','Goods Total Amount'];
const sale=(amount=107,goods='A')=>['05/01/2569','69-01-001','C1','Customer',30,'04/02/2569',amount,goods,50];

function selectedFile(r,name,grid){
 const book=r.XLSX.utils.book_new();r.XLSX.utils.book_append_sheet(book,r.XLSX.utils.aoa_to_sheet(grid),'Data');
 const bytes=r.XLSX.write(book,{type:'buffer',bookType:'xlsx'});
 return {name,size:bytes.length,arrayBuffer:async()=>bytes};
}
test('one selection reads PF, TNP and NV with independent mappings and totals',async()=>{
 const r=rawReportRuntime(),files=[
  selectedFile(r,'PF ขาย.xlsx',[['Invoice Date','Doc No','Customer No','Net Amount'],['2026-01-05','S1','C1',100]]),
  selectedFile(r,'TNP ขาย.xlsx',[['Customer No','Invoice No','Invoice Date','ยอดขาย'],['C1','S1','2026-01-06',200]]),
  selectedFile(r,'NV ขาย.xlsx',[['Doc No','Net Amount','Customer No','Doc Date'],['S1',300,'C1','2026-01-07']])
 ];
 await r.context.rrLoadFiles('sales',files);
 const rows=r.context.rrRead('sales');assert.equal(rows.length,3);assert.equal(rows.reduce((n,row)=>n+row.amount,0),600);
 assert.deepEqual(Array.from(rows,row=>row.company),['โปรเฟส','TNP','Novat']);
 assert.deepEqual(Array.from(rows,row=>row.date),['2026-01-05','2026-01-06','2026-01-07']);
 assert.equal(r.context.rrCurrentInput('sales').filename,'PF ขาย.xlsx');
});
test('duplicate-company and unidentified files block the combined read',async()=>{
 const r=rawReportRuntime(),grid=[['Invoice Date','Doc No','Customer No','Net Amount'],['2026-01-05','S1','C1',100]];
 await r.context.rrLoadFiles('sales',[selectedFile(r,'PF ขาย.xlsx',grid),selectedFile(r,'PF ขายใหม่.xlsx',grid)]);
 assert.throws(()=>r.context.rrRead('sales'),/อยู่ในหลายไฟล์/);
 await r.context.rrLoadFiles('sales',[selectedFile(r,'PF ขาย.xlsx',grid),selectedFile(r,'ไม่ทราบบริษัท.xlsx',grid)]);
 assert.throws(()=>r.context.rrRead('sales'),/กรุณาระบุบริษัท/);
});
test('unreadable batch file keeps the previous selection intact',async()=>{
 const r=rawReportRuntime(),grid=[['Invoice Date','Doc No','Customer No','Net Amount'],['2026-01-05','S1','C1',100]];
 await r.context.rrLoadFiles('sales',[selectedFile(r,'PF ขาย.xlsx',grid)]);
 const old=r.context.rrCurrentInput('sales');
 await assert.rejects(r.context.rrLoadFiles('sales',[selectedFile(r,'NV ขาย.xlsx',grid),{name:'TNP ขาย.xlsx',size:16*1024*1024}]),/TNP ขาย.xlsx.*15 MB/);
 assert.equal(r.context.rrCurrentInput('sales'),old);assert.equal(r.context.rrRead('sales')[0].amount,100);
});
test('AR and receipt batches keep company boundaries and retain untouched companies',async()=>{
 const r=rawReportRuntime();
 for(const [kind,headers,record,key]of [
  ['ar',['Invoice Date','Doc No','Customer No','Outstanding'],['2026-10-01','B1','C1',50],'balance'],
  ['receipts',['Receipt Date','Invoice No','Customer No','Amount Applied'],['2026-10-20','B1','C1',25],'received']
 ]){
  await r.context.rrLoadFiles(kind,['PF','TNP','NV'].map(company=>selectedFile(r,company+' ใหม่.xlsx',[headers,record])));
  const incoming=r.context.rrRead(kind);assert.equal(incoming.length,3);
  const previous=[{company:'อื่น',code:'C2',bill:'KEEP',[key]:999},{company:'Novat',code:'C1',bill:'OLD',[key]:999}];
  const merged=r.context.rrMergeCompanyRows(previous,incoming,'2026-10-01','2026-10-31');
  assert.equal(merged.length,4);assert.equal(merged[0][key],999);assert.equal(merged.filter(row=>row.company==='Novat').length,1);
  assert.equal(merged.filter(row=>row.bill==='B1').reduce((sum,row)=>sum+row[key],0),record[3]*3);
 }
});

test('ERP goods rows with repeated invoice totals count one invoice',()=>{
 const r=rawReportRuntime(),s=source(r,'sales',[salesHeaders,sale(),sale(107,'B')]);
 assert.equal(s.rows().length,1);
 assert.equal(s.rows()[0].amount,107);
 assert.equal(s.rows()[0].credit,30);
 assert.equal(s.rows()[0].due,'2026-02-04');
 assert.equal(s.input.company,'ไม่ระบุบริษัท');
});

test('conflicting invoice totals are rejected instead of keeping the first value',()=>{
 const s=source(rawReportRuntime(),'sales',[salesHeaders,sale(),sale(214,'B')]);
 assert.throws(s.rows,/ยอดรวมหรือวันที่ต่างกัน/);
});

test('generic line-value sales are preserved for aggregation',()=>{
 const s=source(rawReportRuntime(),'sales',[
  ['Doc Date','Doc No','Customer No','Net Amount'],
  ['05/01/2569','B1','C1',100],['05/01/2569','B1','C1',200]
 ]);
 assert.equal(s.rows().length,2);
 assert.equal(s.rows().reduce((sum,row)=>sum+row.amount,0),300);
});
test('sales mapping distinguishes Doc Date, Invoice Date and Sale Order No regardless of header order',()=>{
 const r=rawReportRuntime(),s=source(r,'sales',[
  ['Delivery No','Doc Date','Doc No','Customer No','Net Amount','Sale Order No','Invoice Date','Shipping Date'],
  ['DEL-WRONG','31/01/2569','B1','C1',100,'SO-CORRECT','02/02/2569','30/01/2569']
 ]);
 const row=s.rows()[0];assert.equal(row.shipmentDate,'2026-01-31');assert.equal(row.date,'2026-02-02');assert.equal(row.invoiceDate,'2026-02-02');assert.equal(row.deliveryNo,'SO-CORRECT');
 const ar=[{company:row.company,code:'C1',bill:'B1',name:'Customer',date:'2026-01-31',due:'2026-03-01',balance:100}];
 const receipts=[{company:row.company,code:'C1',bill:'B1',date:'2026-01-31',receivedDate:'2026-02-12',received:50}];
 const report=r.context.rrBuild([row],ar,[],receipts,2569,'2026-03-01');assert.equal(report.monthly.rows[0][8],0);assert.equal(report.monthly.rows[0][10],100);assert.equal(report.monthly.rows[0][7],10);
 assert.equal(ar[0].date,'2026-01-31');
});
test('an explicit conflicting Invoice Date is rejected rather than silently replaced by Doc Date',()=>{
 const c=rawReportRuntime().context,sales=[{company:'PF',code:'C1',bill:'B1',name:'Customer',date:'2026-02-02',invoiceDate:'2026-02-02',shipmentDate:'2026-01-31',amount:100}];
 assert.throws(()=>c.rrBuild(sales,[{company:'PF',code:'C1',bill:'B1',date:'2026-01-31',invoiceDate:'2026-01-31',balance:100}],[],[],2569,'2026-03-01'),/วันที่เอกสารยอดขาย/);
});

test('one source column can feed multiple fields while type checks remain active',()=>{
 const r=rawReportRuntime(),s=source(r,'sales',[salesHeaders,sale()]);
 s.input.map.customerCredit=s.input.map.credit;
 assert.equal(s.rows()[0].customerCredit,30);
 s.input.map.date=s.input.map.name;
 assert.throws(s.rows,/วันที่ไม่ถูกต้อง/);
});

const receiptHeaders=['Doc. Date','Doc. No','Invoice No','Receipts No','AR No','AR Name','Amount','Doc. Date','Doc. No','Invoice No','Pay Amount'];
test('receipt export uses original invoice reference and allocated amount',()=>{
 const s=source(rawReportRuntime(),'receipts',[receiptHeaders,
  ['10/02/2569','RV1','RV1','PR1','C1','Customer',999,'05/01/2569','69-01-001','RV1',107]
 ]);
 const row=s.rows()[0];
 assert.equal(row.bill,'69-01-001');
 assert.equal(row.received,107);
 assert.equal(row.date,'2026-01-05');
 assert.equal(row.receivedDate,'2026-02-10');
});

test('missing optional due dates are accepted; malformed dates still fail',()=>{
 const r=rawReportRuntime(),s=source(r,'ar',[
  ['Doc Date','Doc No','Customer No','Payment Due Date','Remain Amount'],
  ['05/01/2569','B1','C1',null,100]
 ]);
 assert.equal(s.rows()[0].balance,100);
 s.input.book.Sheets.Data.D2={t:'s',v:'not a date'};
 assert.throws(s.rows,/วันที่ไม่ถูกต้อง/);
});

test('historical settlements and credit notes calculate without inventing sales',()=>{
 const r=rawReportRuntime();
 const sales=source(r,'sales',[salesHeaders,sale()]).rows();
 const receipts=source(r,'receipts',[receiptHeaders,
  ['10/02/2569','RV1','RV1','PR1','C1','Customer',100,'01/12/2568','68-12-001','RV1',100],
  ['10/02/2569','RV1','RV1','PR1','C1','Customer',-10,'01/12/2568','CN6812-001','RV1',-10]
 ]).rows();
 const plan=r.context.rrBuild(sales,[],[],receipts,2569,'2026-10-30');
 assert.equal(plan.checks.sales,107);
 assert.equal(plan.monthly.rows[0][7],71);
 assert.ok(plan.warnings.some(w=>w.includes('ใบลดหนี้ 1 แถว')));
});

test('advance receipts preserve signed days and disclose them',()=>{
 const r=rawReportRuntime(),sales=source(r,'sales',[salesHeaders,sale()]).rows();
 const receipts=source(r,'receipts',[receiptHeaders,
  ['04/01/2569','RV1','RV1','PR1','C1','Customer',107,'05/01/2569','69-01-001','RV1',107]
 ]).rows();
 const plan=r.context.rrBuild(sales,[],[],receipts,2569,'2026-10-30');
 assert.equal(plan.monthly.rows[0][7],-1);
 assert.ok(plan.warnings.some(w=>w.includes('รับก่อนวันที่บิล 1 แถว')));
});

test('overpayments and unmatched receipts without original dates still fail',()=>{
 const r=rawReportRuntime(),sales=source(r,'sales',[salesHeaders,sale()]).rows();
 const receipt={company:'ไม่ระบุบริษัท',code:'C1',bill:'69-01-001',received:108,receivedDate:'2026-02-10'};
 assert.throws(()=>r.context.rrBuild(sales,[],[],[receipt],2569,'2026-10-30'),/เกินยอดบิล/);
 assert.throws(()=>r.context.rrBuild(sales,[],[],[{...receipt,bill:'unknown'}],2569,'2026-10-30'),/จับคู่บิลไม่ได้/);
});
