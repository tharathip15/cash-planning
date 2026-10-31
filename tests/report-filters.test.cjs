const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {rawReportRuntime}=require('./helpers/raw-reports.cjs');
function setup(){
 const c=rawReportRuntime().context;
 Object.assign(c,{view:'report-monthly',localStorage:{getItem:()=>null},bangkokToday:()=> '2026-10-30',arInvoices:[],data:[]});
 vm.runInContext(fs.readFileSync('public/counterparty-fields.js','utf8'),c);
 vm.runInContext(fs.readFileSync('public/reports.js','utf8'),c);
 c.fixture={monthly:{months:[{key:'256909',sales:8,outstanding:9},{key:'256910',sales:10,outstanding:11}],columns:Array.from({length:14},(_,i)=>({key:'c'+i})),rows:[
  [1,'โปรเฟส','C1','Sales','Customer','External',30,0,100,40,200,60,300,100],
  [2,'NV','C1','Sales','Customer NV','External',30,0,100,50,100,0,200,50],
  [3,'PF','C2','Other','No notes','External',30,0,100,0,100,0,200,0]
 ]},rawSources:{ar:{asOf:'2026-10-30',rows:[
  {company:'PF',code:'C1',bill:'B1',date:'2026-09-01',due:'2026-10-01',balance:40},
  {company:'PF',code:'C1',bill:'B2',date:'2026-10-01',due:'2026-10-30',balance:60},
  {company:'NV',code:'C1',bill:'N1',date:'2026-09-01',due:'2026-10-31',balance:50}
 ]}}};
 vm.runInContext("reportData=fixture;reportState.monthly.from='256909';reportState.monthly.to='256910';customerBehaviorProfiles={'customer:pf|C1':{paymentBehavior:'usually_late'},'customer:nv|C1':{paymentBehavior:'on_due'}}",c);
 return c;
}
test('monthly customer code, customer and salesperson order changes presentation and Excel without moving source values',()=>{
 const c=setup(),before=JSON.stringify(c.fixture.monthly.rows),columns=c.reportColumns('monthly');
 assert.deepEqual(Array.from(columns.slice(0,5),col=>col.key),['c0','c1','c2','c4','c3']);
 const spec=c.reportExportSpec();assert.deepEqual(Array.from(spec.cols.slice(2,5),col=>col.key),['c2','c4','c3']);
 assert.equal(spec.rows[0].c2,'C1');assert.equal(spec.rows[0].c4,'Customer');assert.equal(spec.rows[0].c3,'Sales');assert.equal(JSON.stringify(c.fixture.monthly.rows),before);
});
test('overdue filter respects months, live settlements and debtor exclusions',()=>{
 const c=setup();vm.runInContext("reportState.monthly.overdue='yes'",c);
 assert.equal(c.reportRows().length,1);
 vm.runInContext("reportState.monthly.from='256910'",c);assert.equal(c.reportRows().length,0);
 vm.runInContext("reportState.monthly.from='256909'",c);
 c.debtorReportExcluded=()=>true;assert.equal(c.reportRows().length,0);delete c.debtorReportExcluded;
 c.arInvoices=[{id:'A',sourceCompany:'PF',sourceCustomerCode:'C1',billNo:'B1'}];
 c.data=[{type:'in',certainty:'received',arInvoiceId:'A',date:'2026-10-31',amount:40}];
 assert.equal(c.reportRows().length,0);
});
test('payment behaviors are company scoped and combine with overdue, search and export',()=>{
 const c=setup();vm.runInContext("reportState.monthly.paymentBehavior='usually_late';reportState.monthly.overdue='yes'",c);
 assert.equal(c.reportRows().length,1);assert.equal(c.reportExportSpec().rows[0].c2,'C1');assert.equal(c.reportExportSpec().rows.at(-1).c13,100);
 vm.runInContext("reportState.monthly.paymentBehavior='on_due'",c);assert.equal(c.reportRows().length,0);
 vm.runInContext("reportState.monthly.overdue='no'",c);assert.equal(c.reportRows()[0][1],'NV');
 vm.runInContext("reportState.monthly.paymentBehavior=''",c);assert.equal(c.reportRows()[0][2],'C2');
 vm.runInContext("reportState.monthly.query='missing'",c);assert.equal(c.reportRows().length,0);
});
test('name-only notes apply only to an unambiguous customer',()=>{
 const c=setup();vm.runInContext("customerBehaviorProfiles={'name:nonotes':{paymentBehavior:'early'}};reportState.monthly.paymentBehavior='early'",c);
 assert.equal(c.reportRows()[0][2],'C2');
 c.fixture.monthly.rows.push([4,'NV','C2','Other','No notes','External',30]);assert.equal(c.reportRows().length,0);
});
test('overdue days uses oldest open due date in selected months and exports integer days',()=>{
 const c=setup();c.reportRows();const row=c.fixture.monthly.rows[0];
 assert.equal(c.reportValue(row,'overdueDays'),29);
 const column=c.reportColumns().find(column=>column.key==='overdueDays');assert.equal(column.unit,'days');assert.equal(c.reportFormat(29,column),'29');
 assert.equal(c.reportExportSpec().rows[0].overdueDays,29);assert.equal(c.reportExportSpec().rows.at(-1).overdueDays,undefined);
 vm.runInContext("reportState.monthly.from='256910'",c);c.reportRows();assert.equal(c.reportValue(row,'overdueDays'),0);
 vm.runInContext("reportState.monthly.from='256909'",c);
 c.fixture.rawSources.ar.rows.push({company:'PF',code:'C1',bill:'B3',date:'2026-09-02',due:'2026-09-01',balance:5});
 c.reportRows();assert.equal(c.reportValue(row,'overdueDays'),59);
 c.arInvoices=[{id:'A',sourceCompany:'PF',sourceCustomerCode:'C1',billNo:'B3'}];c.data=[{type:'in',certainty:'received',arInvoiceId:'A',date:'2026-10-31',amount:5}];
 c.reportRows();assert.equal(c.reportValue(row,'overdueDays'),29);
 c.debtorReportExcluded=()=>true;assert.equal(c.reportValue(row,'overdueDays'),0);
});
test('missing due dates and absent bill sources do not invent overdue day counts',()=>{
 const c=setup(),row=c.fixture.monthly.rows[0];delete c.fixture.rawSources.ar.rows[0].due;c.reportRows();assert.equal(c.reportValue(row,'overdueDays'),'');
 delete c.fixture.rawSources;c.reportRows();assert.equal(c.reportValue(row,'overdueDays'),'');
});
test('calendar day cards, weekly summaries and details consume the same combined report filters',()=>{
 const c=setup();vm.runInContext(fs.readFileSync('public/customer-calendar.js','utf8'),c);c.view='report-calendar';c.arDate=String;
 c.fixture.monthly.rows[2][5]='Retail';c.fixture.monthly.rows[2][6]=60;
 c.fixture.rawSources.sales={rows:c.fixture.monthly.rows.flatMap(r=>[{company:r[1],code:r[2],name:r[4],bill:r[2]+'-Sep',date:'2026-09-01',amount:r[8]},{company:r[1],code:r[2],name:r[4],bill:r[2]+'-Oct',date:'2026-10-01',amount:r[10]}])};
 for(const [filter,company,code,sales,debt]of [
  ["company='NV'",'NV','C1',100,50],
  ["type='Retail'",'PF','C2',100,0],
  ["salesperson='Other'",'PF','C2',100,0],
  ["credit='60'",'PF','C2',100,0],
  ["overdue='yes'",'PF','C1',100,40],
  ["paymentBehavior='on_due'",'NV','C1',100,50],
  ["company='NV';reportState.monthly.column='c4';reportState.monthly.query='Customer NV'",'NV','C1',100,50]
 ]){
  vm.runInContext("Object.assign(reportState.monthly,{query:'',column:'all',company:'all',type:'all',salesperson:'all',credit:'all',overdue:'all',paymentBehavior:'all'});reportState.monthly."+filter,c);
  const records=c.customerCalendarRecords('report',c.reportRows());assert.ok(records.length>0);assert.ok(records.every(r=>c.reportCompanyCode(r.company)===company&&r.code===code));
  const summary=c.customerCalendarSummary('2026-09',records);assert.equal(summary.month.sales,sales);assert.equal(summary.month.outstanding,debt);assert.equal(summary.weeks[0].outstanding,debt);
  const card=c.customerReportCalendarDayHTML(records.filter(r=>r.date==='2026-09-01')).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');assert.ok(card.includes('ยอดขาย '+sales+' บาท'));assert.ok(card.includes('ยอดค้างรวม '+debt+' บาท'));
  let detail;c.showCardDetail=(...args)=>detail=args;c.customerCalendarDetail('report','2026-09-01',records);assert.equal(detail[3].rows.at(-1).sales,sales);assert.equal(detail[3].rows.at(-1).outstanding,debt);
 }
 vm.runInContext("reportState.monthly.query='no match'",c);assert.equal(c.customerCalendarRecords('report',c.reportRows()).length,0);
});
test('calendar month navigation is bounded by report month filters and leaves the tracking calendar independent',()=>{
 const c=setup();vm.runInContext(fs.readFileSync('public/customer-calendar.js','utf8'),c);c.arDate=String;c.arAsOf='2026-08-01';
 vm.runInContext("customerCalendarState.report.month='2026-08';customerCalendarState.ar.month='2026-08';reportState.monthly.from='256910'",c);
 c.customerCalendarHTML('report',[]);assert.equal(vm.runInContext('customerCalendarState.report.month',c),'2026-10');assert.equal(vm.runInContext('customerCalendarState.ar.month',c),'2026-08');
 assert.equal(c.customerCalendarSetMonth('report','2026-09'),false);assert.equal(c.customerCalendarSetMonth('report','2026-10'),true);assert.equal(c.customerCalendarSetMonth('ar','2026-09'),true);
 vm.runInContext("reportState.monthly.from='256909'",c);assert.equal(c.customerCalendarSetMonth('report','2026-09'),true);
 const buttons=[{dataset:{customerShift:'-1'}},{dataset:{customerShift:'1'}}],monthInput={};
 c.$=selector=>selector==='#customer-calendar-month'?monthInput:{};c.document={querySelectorAll:selector=>selector==='[data-customer-shift]'?buttons:[]};c.reportRender=()=>{};vm.runInContext("customerCalendarState.report.mode='calendar'",c);
 c.bindCustomerCalendar('report',[]);assert.equal(buttons[0].disabled,true);assert.equal(buttons[1].disabled,false);assert.equal(monthInput.min,'2026-09');assert.equal(monthInput.max,'2026-10');
 buttons[1].onclick();assert.equal(vm.runInContext('customerCalendarState.report.month',c),'2026-10');
 monthInput.value='2026-11';monthInput.onchange({target:monthInput});assert.equal(monthInput.value,'2026-10');
});
