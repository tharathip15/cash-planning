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
