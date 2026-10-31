const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {rawReportRuntime}=require('./helpers/raw-reports.cjs');
function runtime(){const c=rawReportRuntime().context;vm.runInContext(fs.readFileSync('public/reports.js','utf8'),c);vm.runInContext(fs.readFileSync('public/customer-calendar.js','utf8'),c);return c}
test('explicit Buddhist year control changes years and reports unavailable filtered years',()=>{
 const c=runtime();assert.equal(c.calendarMonthInYear('2026-10','2570'),'2027-10');assert.equal(c.calendarMonthInYear('2026-10','2568'),'2025-10');assert.equal(c.calendarMonthInYear('2026-10','oops'),'');
 assert.equal(c.calendarMonthInYear('2026-10','2570',['2026-10']),'');assert.equal(c.calendarMonthInYear('2026-10','2570',['2027-01']),'2027-01');
 const input={value:'2570'},message={textContent:''};c.$=key=>key==='#calendar-year'?input:message;let selected='';c.bindCalendarYear('2026-10',null,next=>selected=next);input.onchange();assert.equal(selected,'2027-10');
 selected='';c.bindCalendarYear('2026-10',['2026-10'],next=>selected=next);input.onchange();assert.equal(selected,'');assert.ok(message.textContent.includes('ไม่มีข้อมูล'));assert.equal(input.value,2569);
});
test('calendar groups company aliases but keeps identical customer codes in different companies separate',()=>{
 const c=runtime(),rows=c.customerCalendarGroups([{company:'PF',code:'C1',name:'A',bill:'B1',sales:100},{company:'โปรเฟส',code:'c1',name:'A',bill:'B1',outstanding:40},{company:'NV',code:'C1',name:'A',bill:'B1',sales:200},{company:'TNP',code:'C1',name:'A',bill:'B1',outstanding:-10}]);
 assert.equal(rows.length,3);const pf=rows.find(r=>r.company==='PF');assert.equal(pf.sales,100);assert.equal(pf.outstanding,40);assert.equal(pf.bills,1);assert.equal(rows.find(r=>r.company==='TNP').outstanding,-10);
});
test('invalid and missing dates are separate, leap dates are validated',()=>{
 const c=runtime();assert.equal(c.customerCalendarDate('2026-02-29'),false);assert.equal(c.customerCalendarDate('2024-02-29'),true);assert.equal(c.customerCalendarDate(''),false);
});
test('debt calendar uses live balances and switches between promise and due dates without inventing dates',()=>{
 const c=runtime();c.arOutstanding=r=>r.amount-r.priorPaid;
 const bills=[{id:'1',customer:'A',sourceCompany:'PF',billNo:'B1',dueDate:'2026-01-15',amount:100,priorPaid:60}];
 let rows=c.customerCalendarRecords('ar',bills);assert.equal(rows[0].date,'');assert.equal(rows[0].outstanding,40);
 vm.runInContext("customerCalendarState.ar.basis='dueDate'",c);rows=c.customerCalendarRecords('ar',bills);assert.equal(rows[0].date,'2026-01-15');
});
test('report calendar follows selected customers, months, post-snapshot receipts and excluded debt groups',()=>{
 const c=runtime();
 c.fixture={year:2569,asOf:'2026-01-10',monthly:{months:[{key:'256901',sales:8,outstanding:9}],columns:Array.from({length:12},(_,i)=>({key:'c'+i})),rows:[[1,'PF','C1','','A','',30,null,100,40,100,40]]},rawSources:{sales:{rows:[{company:'PF',code:'C1',name:'A',bill:'B1',date:'2026-01-01',amount:100},{company:'NV',code:'C2',bill:'B2',date:'2026-01-01',amount:999},{company:'PF',code:'C1',bill:'B3',date:'2026-02-01',amount:500}]},ar:{asOf:'2026-01-10',rows:[{company:'PF',code:'C1',name:'A',bill:'B1',date:'2026-01-01',balance:40}]}}};
 c.arInvoices=[{id:'A1',sourceCompany:'PF',sourceCustomerCode:'C1',billNo:'B1'}];c.data=[{arInvoiceId:'A1',type:'in',certainty:'received',date:'2026-01-12',amount:10}];
 vm.runInContext("reportData=fixture;reportState.monthly.from='256901';reportState.monthly.to='256901'",c);
 let rows=c.customerCalendarRecords('report',c.fixture.monthly.rows),group=c.customerCalendarGroups(rows)[0];assert.equal(group.sales,100);assert.equal(group.outstanding,30);assert.equal(group.bills,1);
 c.debtorExcluded=()=>true;c.debtorStatus=()=>({group:'3'});
 group=c.customerCalendarGroups(c.customerCalendarRecords('report',c.fixture.monthly.rows))[0];assert.equal(group.sales,100);assert.equal(group.outstanding,0);
});
test('summary-only imports show unavailable daily data instead of fabricated calendar totals',()=>{
 const c=runtime();c.fixture={monthly:{columns:[{key:'c8'},{key:'c9'}]}};vm.runInContext('reportData=fixture',c);assert.equal(c.customerCalendarRecords('report',[]),null);
});
test('calendar renders the correct weekday offset, empty month and undated customer action',()=>{
 const c=runtime();c.arAsOf='2026-02-01';c.arDate=String;
 const html=c.customerCalendarHTML('ar',[{company:'PF',code:'C1',name:'A',date:'',outstanding:40}]);
 assert.equal((html.match(/data-customer-day="2026-02-/g)||[]).length,28);assert.ok(html.includes('data-customer-day="unset"'));assert.ok(html.includes('ไม่มีรายการในเดือนนี้'));assert.ok(!html.includes('aria-hidden="true"'));
});
test('day cards show only company counts of distinct outstanding customers; names appear in clicked details',()=>{
 const c=runtime();c.arAsOf='2026-02-01';c.arDate=String;
 const records=[{company:'PF',code:'C1',name:'Private customer A',bill:'B1',date:'2026-02-01',outstanding:40},{company:'โปรเฟส',code:'C1',name:'Private customer A',bill:'B2',date:'2026-02-01',outstanding:20},{company:'PF',code:'C2',name:'Settled customer',date:'2026-02-01',outstanding:0},{company:'TNP',code:'C1',name:'Private customer B',date:'2026-02-01',outstanding:10},{company:'NV',code:'C1',name:'Credit note',date:'2026-02-01',outstanding:-10}];
 const html=c.customerCalendarHTML('ar',records),day=html.match(/<button[^>]*data-customer-day="2026-02-01"[\s\S]*?<\/button>/)[0];
 assert.ok(day.includes('PF = ยอดค้าง <strong>1</strong> ราย'));assert.ok(day.includes('TNP = ยอดค้าง <strong>1</strong> ราย'));assert.ok(day.includes('NV = ยอดค้าง <strong>0</strong> ราย'));assert.ok(!html.includes('Private customer'));assert.ok(!day.includes('ขาย '));
 let detail;c.showCardDetail=(...args)=>detail=args;c.customerCalendarDetail('ar','2026-02-01',records);
 assert.ok(detail[2].includes('Private customer A'));assert.ok(detail[2].includes('Private customer B'));assert.ok(!detail[2].includes('Settled customer'));assert.equal(detail[3].rows.length,3);assert.equal(detail[3].rows.at(-1).outstanding,70);
});
test('weekly summaries follow Sunday–Saturday, clip to the month and reconcile signed company amounts',()=>{
 const c=runtime(),records=[{company:'PF',code:'C1',bill:'1',date:'2026-10-01',sales:100,outstanding:40},{company:'PF',code:'C1',bill:'2',date:'2026-10-04',sales:200,outstanding:60},{company:'NV',code:'C1',bill:'3',date:'2026-10-31',outstanding:20},{company:'TNP',code:'C2',bill:'4',date:'2026-10-31',outstanding:-5},{company:'PF',code:'X',date:'2026-11-01',outstanding:999},{company:'PF',code:'Y',date:'',outstanding:888}];
 const s=c.customerCalendarSummary('2026-10',records);
 assert.equal(s.weeks.length,5);assert.equal(s.weeks[0].start,'2026-10-01');assert.equal(s.weeks[0].end,'2026-10-03');assert.equal(s.weeks[1].start,'2026-10-04');assert.equal(s.weeks.at(-1).end,'2026-10-31');
 assert.equal(s.month.sales,300);assert.equal(s.month.PF,100);assert.equal(s.month.NV,20);assert.equal(s.month.TNP,-5);assert.equal(s.month.outstanding,115);assert.equal(s.month.customers,2);
 assert.equal(s.weeks.reduce((n,r)=>n+r.outstanding,0),s.month.outstanding);assert.equal(s.weeks.reduce((n,r)=>n+r.sales,0),s.month.sales);assert.equal(s.weeks.reduce((n,r)=>n+r.customers,0),3);
});
test('both calendar pages include their weekly summary, with sales only on the sales report',()=>{
 const c=runtime();c.arAsOf='2026-02-01';c.arDate=String;c.bangkokToday=()=> '2026-02-01';
 const ar=c.customerCalendarHTML('ar',[]),report=c.customerCalendarHTML('report',[]);
 for(const html of [ar,report]){assert.ok(html.includes('สรุปรายสัปดาห์และรายเดือน'));assert.ok(html.includes('data-customer-summary-key="PF"'));assert.ok(html.includes('รวมเดือน'))}
 assert.ok(!ar.includes('data-customer-summary-key="sales"'));assert.ok(report.includes('data-customer-summary-key="sales"'));
});
test('report day shows combined sales and signed debt, with company amounts and unique debtor counts; tracking stays count-only',()=>{
 const c=runtime();c.arAsOf='2026-02-01';c.arDate=String;
 const records=[{company:'PF',code:'C1',name:'PF customer',bill:'B1',date:'2026-02-01',sales:100,outstanding:40},{company:'โปรเฟส',code:'C1',name:'PF customer',bill:'B2',date:'2026-02-01',sales:200,outstanding:20},{company:'TNP',code:'C1',name:'Paid sales customer',bill:'B1',date:'2026-02-01',sales:150,outstanding:0},{company:'NV',code:'C1',name:'NV customer',bill:'B1',date:'2026-02-01',outstanding:60},{company:'NV',code:'C2',name:'Credit note customer',bill:'CN1',date:'2026-02-01',outstanding:-10}];
 const report=c.customerCalendarHTML('report',records),card=report.match(/<button[^>]*data-customer-day="2026-02-01"[\s\S]*?<\/button>/)[0];
 const text=card.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');assert.ok(text.includes('ยอดขาย 450 บาท'));assert.ok(text.includes('ยอดค้างรวม 110 บาท'));
 assert.ok(text.includes('PF 60 บาท 1 ราย'));assert.ok(text.includes('TNP 0 บาท 0 ราย'));assert.ok(text.includes('NV 50 บาท 1 ราย'));assert.ok(card.includes('calendar-debt-row'));assert.ok(card.includes('calendar-amount red'));for(const name of ['PF customer','Paid sales customer','NV customer','Credit note customer'])assert.ok(!card.includes(name));
 const tracking=c.customerCalendarHTML('ar',records).match(/<button[^>]*data-customer-day="2026-02-01"[\s\S]*?<\/button>/)[0];assert.ok(tracking.includes('PF = ยอดค้าง <strong>1</strong> ราย'));assert.ok(!tracking.includes('บาท'));assert.ok(!tracking.includes('ยอดขาย'));
 let detail;c.showCardDetail=(...args)=>detail=args;c.customerCalendarDetail('report','2026-02-01',records);assert.equal(detail[3].rows.at(-1).sales,450);assert.equal(detail[3].rows.at(-1).outstanding,110);assert.ok(detail[2].includes('Paid sales customer'));assert.ok(detail[2].includes('Credit note customer'));
});
