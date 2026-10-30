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
