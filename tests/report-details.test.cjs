const test=require('node:test');
const assert=require('node:assert/strict');
const {rawReportRuntime}=require('./helpers/raw-reports.cjs');
const fs=require('node:fs'),vm=require('node:vm');

function snapshot(){return {schema:1,year:2569,monthly:{months:[{key:'256901',sales:8,outstanding:9}],columns:Array.from({length:12},(_,i)=>({key:'c'+i})),rows:[[1,'โปรเฟส','C1','','Customer','',30,null,100,40,100,40]]},credit:{rows:[[1,'โปรเฟส','C1','Customer','',30,'30 วัน',40,'','','','','ไม่ระบุ']]},rawSources:{sales:{rows:[{company:'โปรเฟส',code:'C1',name:'Customer',bill:'B1',date:'2026-01-01',amount:100,credit:30}]},ar:{rows:[{company:'โปรเฟส',code:'C1',bill:'B1',date:'2026-01-01',balance:40}]},receipts:{rows:[{company:'โปรเฟส',code:'C1',bill:'B1',date:'2026-01-01',receivedDate:'2026-01-11',received:60}]}}}}

test('excludes affiliated customers, without excluding external customers owned by Profess',()=>{
 const c=rawReportRuntime().context;
 assert.equal(c.reportIsAffiliate([1,'โปรเฟส','C1','External','',''], 'credit'),false);
 assert.equal(c.reportIsAffiliate([1,'โปรเฟส','0180-TNP','TNP','',''], 'credit'),true);
 assert.equal(c.reportIsAffiliate([1,'Other','X','บริษัท โปรเฟส อินดัสเทรียล กรุ๊ป จำกัด','',''], 'credit'),true);
});

test('source drilldowns restrict months and customers and reproduce weighted actual days',()=>{
 const c=rawReportRuntime().context,d=snapshot();c.reportSelectedMonths=()=>d.monthly.months;
 d.rawSources.receipts.rows.push({company:'โปรเฟส',code:'C1',bill:'B1',date:'2026-01-01',receivedDate:'2025-12-31',received:40});
 d.rawSources.receipts.rows.push({company:'โปรเฟส',code:'C1',bill:'CN1',received:-10});
 d.rawSources.sales.rows.push({company:'โปรเฟส',code:'C1',bill:'B2',date:'2026-02-01',amount:200});
 d.rawSources.sales.rows.push({company:'โปรเฟส',code:'0180-TNP',bill:'B3',date:'2026-01-01',amount:300});
 const days=c.reportSourceDetail(d.monthly.rows,'c7','monthly',d);
 assert.equal(days.average,5.6);assert.equal(days.rows.length,2);
 const sales=c.reportSourceDetail(d.monthly.rows,'c8','monthly',d);
 assert.equal(sales.rows.length,1);assert.equal(sales.rows[0].amount,100);
});

test('customer edits update both reports, compare credits and survive later imports',()=>{
 const c=rawReportRuntime().context,d=snapshot();
 const edited=c.reportApplyCustomerEdits(d,{'โปรเฟส|C1':{customerCredit:'60',terms:'สิ้นเดือน',paymentType:'โอน'}});
 assert.equal(edited.credit.rows[0][10],'ต่างจากเครดิตเดิม');
 assert.equal(d.credit.rows[0][8],'');
 c.reportData=edited;
 const built=c.rrBuild(d.rawSources.sales.rows,d.rawSources.ar.rows,[],d.rawSources.receipts.rows,2569,'2026-01-31');
 assert.equal(built.credit.rows[0][8],'60');assert.equal(built.credit.rows[0][9],'สิ้นเดือน');
 const blank=c.reportApplyCustomerEdits(built,{'โปรเฟส|C1':{customerCredit:''}});
 assert.equal(blank.credit.rows[0][10],'ไม่ระบุเงื่อนไขลูกค้า');
 assert.equal(blank.customerEdits['โปรเฟส|C1'].terms,'สิ้นเดือน');
});

test('zero-balance bills retain dated settlements, normalize company aliases and keep NV separate',()=>{
 const c=rawReportRuntime().context,d=snapshot();c.reportSelectedMonths=()=>d.monthly.months;
 d.rawSources.sales.rows.push({company:'PF',code:'C1',bill:'B2',date:'2026-01-02',amount:200});
 d.rawSources.receipts.rows.push({company:'โปรเฟส',code:'C1',bill:'B2',date:'2026-01-02',receivedDate:'2026-01-25',receiptNo:'R2',received:200},{company:'NV',code:'C1',bill:'B2',date:'2026-01-02',receivedDate:'2026-01-26',received:999});
 const detail=c.reportSourceDetail(d.monthly.rows,'c9','monthly',d),closed=detail.rows.find(r=>r.bill==='B2');
 assert.equal(closed.amount,0);assert.equal(closed.status,'รับชำระครบตามไฟล์');assert.equal(detail.events.length,2);
 assert.equal(detail.events.find(r=>r.bill==='B2').eventDate,'2026-01-25');assert.equal(c.reportCompanyLabel('NV'),'NV · Novat');
});
test('a moved debt remains visible with its balance and does not claim a payment or invent a clearing date',()=>{
 const c=rawReportRuntime().context,d=snapshot();c.reportSelectedMonths=()=>d.monthly.months;c.debtorExcluded=()=>true;c.debtorStatus=()=>({group:'3'});
 d.rawSources.receipts.rows=[];const detail=c.reportSourceDetail(d.monthly.rows,'c9','monthly',d);
 assert.equal(detail.rows[0].amount,0);assert.equal(detail.rows[0].currentBalance,40);assert.match(detail.rows[0].status,/กลุ่ม 3/);assert.equal(detail.events.length,0);
});
test('overdue follows original invoice due dates and positive live balances, not customer terms or promises',()=>{
 const c=rawReportRuntime().context,d=snapshot();c.reportSelectedMonths=()=>d.monthly.months;c.bangkokToday=()=> '2026-01-31';d.rawSources.ar.asOf='2026-01-20';
 d.rawSources.ar.rows[0].due='2026-01-31';c.reportPrepareOverdue(d);assert.equal(c.reportIsOverdueCell(d.monthly.rows[0],'c9',d),false);
 d.rawSources.ar.rows[0].due='2026-01-30';c.reportPrepareOverdue(d);assert.equal(c.reportIsOverdueCell(d.monthly.rows[0],'c9',d),true);assert.equal(c.reportIsOverdueCell(d.monthly.rows[0],'c8',d),false);
 c.arInvoices=[{id:'A1',sourceCompany:'PF',sourceCustomerCode:'C1',billNo:'B1',promiseDate:'2026-02-28'}];c.data=[{type:'in',certainty:'received',arInvoiceId:'A1',date:'2026-01-25',amount:40}];
 c.reportPrepareOverdue(d);assert.equal(c.reportIsOverdueCell(d.monthly.rows[0],'c9',d),false);
 const detail=c.reportSourceDetail(d.monthly.rows,'c9','monthly',d);assert.equal(detail.rows[0].amount,0);assert.equal(detail.events.at(-1).eventDate,'2026-01-25');
 c.data=[];delete d.rawSources.ar.rows[0].due;c.reportPrepareOverdue(d);assert.equal(c.reportIsOverdueCell(d.monthly.rows[0],'c9',d),false);
});

test('Excel paste updates a rectangle and rejects overflow without changing drafts',()=>{
 const c=rawReportRuntime().context,rows=[{values:{}},{values:{}}];
 const next=c.reportPasteCustomerTerms(rows,0,1,'30\t60\tสิ้นเดือน\n45\t90\tวันที่ 15\n');
 assert.equal(next[1].values.customerCredit,'90');assert.equal(next[0].values.terms,'สิ้นเดือน');
 assert.equal(Object.keys(rows[0].values).length,0);
 assert.throws(()=>c.reportPasteCustomerTerms(rows,1,1,'30\n45'),/เกิน/);
});

test('packed snapshots round trip all source values and accept old plain snapshots',()=>{
 const c=rawReportRuntime().context,d=snapshot();
 const packed=c.reportSerializeSnapshot(d),restored=c.reportDeserializeSnapshot(packed);
 assert.deepEqual(JSON.parse(JSON.stringify(restored)),d);
 assert.deepEqual(JSON.parse(JSON.stringify(c.reportDeserializeSnapshot(JSON.stringify(d)))),d);
});

test('the calculate button runs the linked preview and retains bill sources for drilldowns',()=>{
 const r=rawReportRuntime(),c=r.context,elements=new Map();
 c.$=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,innerHTML:'',insertAdjacentHTML(){}});return elements.get(id)};
 c.document={body:{insertAdjacentHTML(){}},querySelectorAll:()=>[]};
 c.reportData=snapshot();c.arInvoices=[];c.arPending={};
 const raw=fs.readFileSync('public/reports-raw.js','utf8');
 vm.runInContext(raw.slice(raw.indexOf('document.body.insertAdjacentHTML')),c);
 vm.runInContext(fs.readFileSync('public/reports-links.js','utf8'),c);
 for(let kind of ['sales','ar','receipts'])r.setInput(kind,{cached:true,rows:snapshot().rawSources[kind].rows,filename:kind,asOf:'2026-01-31'});
 c.$('#rr-year').value='2569';c.$('#rr-asof').value='2026-01-31';c.$('#rr-scope').value='both';
 c.$('#rr-check').onclick();
 assert.equal(c.$('#rr-error').textContent,'');
 assert.equal(vm.runInContext('rrPlan.rawSources.receipts.rows.length',c),1);
 assert.ok(vm.runInContext('rrPlan.monthly.cashLink',c));
});

test('actual-day display rounds to whole days without changing credit balances or the underlying average',()=>{
 const r=rawReportRuntime(),c=r.context;
 assert.equal(c.reportDayDisplay(95.79),'96');assert.equal(c.reportDayDisplay(64.08),'64');
 assert.equal(c.reportDayDisplay(0),'0');assert.equal(c.reportDayDisplay(null),'—');
 const report=vm.createContext({Intl,esc:String});
 vm.runInContext(fs.readFileSync('public/reports.js','utf8'),report);
 const row=[];row[7]=95.79;
 assert.equal(report.reportValue(row,'c7','monthly'),96);
 assert.equal(report.reportValue(row,'c7','credit'),95.79);
 assert.equal(row[7],95.79);
 assert.equal(report.reportFormat(95.79,{key:'c7',label:'จำนวนวันรับเงินจริง',unit:'days',type:'number'}),'96');
 assert.equal(report.reportFormat(95.79,{key:'c7',label:'ยอดค้าง',type:'number'}),'95.79');
});

test('updating only AR keeps saved sales and receipts; cancelling a replacement restores its saved source',()=>{
 const r=rawReportRuntime(),c=r.context,elements=new Map(),d=snapshot();
 c.$=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,innerHTML:'',insertAdjacentHTML(){}});return elements.get(id)};
 c.document={body:{insertAdjacentHTML(){}},querySelectorAll:()=>[]};c.reportData=d;c.arInvoices=[];c.arPending={};
 const raw=fs.readFileSync('public/reports-raw.js','utf8');vm.runInContext(raw.slice(raw.indexOf('document.body.insertAdjacentHTML')),c);vm.runInContext(fs.readFileSync('public/reports-links.js','utf8'),c);
 for(const kind of ['sales','ar','receipts'])r.setInput(kind,{...c.rrSavedInput(kind)});
 c.rrSetSourceMode('ar','upload');assert.throws(()=>c.rrValidateSourceModes(),/เลือกไฟล์ใหม่/);
 const headers=r.schemas.ar.map(f=>f[1]),values=r.schemas.ar.map(f=>({company:'โปรเฟส',code:'C1',name:'Customer',bill:'B1',date:'2026-01-01',due:'2026-01-31',balance:25}[f[0]]??''));
 const book=r.XLSX.utils.book_new();r.XLSX.utils.book_append_sheet(book,r.XLSX.utils.aoa_to_sheet([headers,values]),'AR');r.setInput('ar',{book,sheet:'AR',filename:'new-ar.xlsx',company:'โปรเฟส'});vm.runInContext("rrAutoMap('ar')",c);
 c.$('#rr-year').value='2569';c.$('#rr-asof').value='2026-01-31';c.$('#rr-scope').value='both';c.rrPreview();
 assert.equal(c.$('#rr-error').textContent,'');assert.equal(vm.runInContext('rrPlan.rawSources.ar.rows[0].balance',c),25);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(rrPlan.rawSources.sales.rows)',c)),d.rawSources.sales.rows);
 assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(rrPlan.rawSources.receipts.rows)',c)),d.rawSources.receipts.rows);
 assert.match(c.rrSourceSummary(),/อัปเดตใหม่: ลูกหนี้/);assert.match(c.rrSourceSummary(),/คงข้อมูลเดิม: ยอดขาย/);
 c.rrSetSourceMode('ar','keep');assert.equal(vm.runInContext('rrInputs.ar.rows[0].balance',c),40);assert.doesNotThrow(()=>c.rrValidateSourceModes());
});
