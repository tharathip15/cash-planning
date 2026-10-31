const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function setup(rows=[]){
 const c=vm.createContext({Date,Intl,console,document:{querySelector:()=>({textContent:''}),querySelectorAll:()=>[]},localStorage:{setItem(){}},records:rows});
 vm.runInContext(fs.readFileSync('public/cash-calendar.js','utf8'),c);
 const app=fs.readFileSync('public/app.js','utf8');
 vm.runInContext(app.slice(0,app.indexOf('function choice')),c);
 vm.runInContext('data=records',c);
 c.effective=vm.runInContext('(row)=>amount(row)',c);
 c.total=vm.runInContext('()=>sum(data,"out")',c);
 c.setRange=(from,to)=>{c.testFrom=from;c.testTo=to;vm.runInContext('rangeStart=testFrom;rangeEnd=testTo',c)};
 return c;
}
const budget=(id=28,date='2026-11-01')=>({id,date,name:'ซัพเงินสด',type:'out',category:'cash',amount:3000000,payStatus:'uncertain',period:'unset'});
const expense=(amount=100000,date='2026-11-01')=>({id:100001,date,name:'Supplier',type:'out',category:'cash',amount,payStatus:'uncertain',period:'unset'});

test('cash expenses consume the daily envelope without counting twice or mutating the original budget',()=>{
 const b=budget(),e=expense(),c=setup([b,e]);
 assert.equal(c.effective(b),2900000);assert.equal(c.total(),3000000);assert.equal(b.amount,3000000);
 e.amount=200000;assert.equal(c.effective(b),2800000);
 e.category='credit';assert.equal(c.effective(b),3000000);assert.equal(c.total(),3200000);
 e.category='cash';e.date='2026-11-02';assert.equal(c.effective(b),3000000);
});

test('uses confirmed actual amounts, handles overspend and allocates multiple envelopes once',()=>{
 const a=budget(),b=budget(29),e=expense(4000000),c=setup([a,b,e]);
 assert.equal(c.effective(a),0);assert.equal(c.effective(b),2000000);assert.equal(c.total(),6000000);
 e.amount=7000000;assert.equal(c.effective(b),0);assert.equal(c.total(),7000000);
 e.payStatus='paid';e.actualAmount=50000;
 assert.equal(c.effective(a),2950000);assert.equal(c.effective(b),3000000);assert.equal(c.total(),6000000);
});

test('finalized budget records retain their confirmed amounts',()=>{
 const b={...budget(),payStatus:'paid',actualAmount:2500000},c=setup([b,expense()]);
 assert.equal(c.effective(b),2500000);
 assert.equal(c.isCashBudget({...expense(),name:'จ่ายเงินสด'}),false);
});
test('calendar payment categories reconcile effective actuals and remaining envelopes without assuming unclassified costs',()=>{
 const b=budget(),inventory={...expense(100000),expenseType:'inventory'},operating={...expense(200000),id:100002,expenseType:'expense',payStatus:'paid',actualAmount:150000},incoming={type:'in',amount:999,expenseType:'expense'};
 const c=setup([b,inventory,operating,incoming]),totals=c.calendarExpenseBreakdown([b,inventory,operating,incoming]);
 assert.equal(totals.inventory,100000);assert.equal(totals.expense,150000);assert.equal(totals.unset,2750000);assert.equal(totals.inventory+totals.expense+totals.unset,c.total());
 c.money=String;const html=c.calendarExpenseBreakdownHTML([inventory,operating]);assert.ok(html.includes('ต้นทุนขาย'));assert.ok(html.includes('ค่าใช้จ่าย'));assert.ok(!html.includes('ยังไม่ระบุประเภท'));
 assert.equal(c.calendarExpenseBreakdown([operating]).inventory,0);assert.equal(c.calendarExpenseBreakdown([operating]).expense,150000);
});

test('Sunday–Saturday summaries include unknown periods and separate uncertain receipts',()=>{
 const rows=[budget(),expense(),
  {id:201,date:'2026-11-01',type:'in',certainty:'confirmed',amount:100,period:'unset'},
  {id:202,date:'2026-11-08',type:'in',certainty:'uncertain',amount:70,period:'unset'}];
 const c=setup(rows);c.setRange('2026-11-01','2026-11-08');
 const summary=c.calendarMonthSummary('2026-11',rows);
 assert.equal(summary.weeks.length,2);assert.equal(summary.weeks[0].end,'2026-11-07');
 assert.equal(summary.month.expense,3000000);assert.equal(summary.month.income,100);assert.equal(summary.month.uncertain,70);
 assert.equal(summary.month.net,-2999900);
 assert.equal(summary.weeks.reduce((n,w)=>n+w.expense,0),summary.month.expense);
});

test('month boundaries and partial selected ranges do not count transactions twice',()=>{
 const rows=[expense(10,'2026-11-30'),expense(20,'2026-12-01'),expense(999,'2026-12-02')],c=setup(rows);
 c.setRange('2026-11-30','2026-12-01');
 assert.equal(c.calendarMonthSummary('2026-11',rows).month.expense,10);
 assert.equal(c.calendarMonthSummary('2026-12',rows).month.expense,20);
});

test('calendar Excel includes daily, weekly and monthly summaries with matching amounts',()=>{
 const rows=[budget(),expense()],c=setup(rows);c.setRange('2026-11-01','2026-11-01');
 c.rangeDates=()=>['2026-11-01'];
 vm.runInContext(fs.readFileSync('public/export-views.js','utf8'),c);
 const spec=c.ioCalendarExportSpec(rows);
 assert.equal(spec.rows.length,3);
 assert.ok(spec.rows.every(r=>r.expense===3000000));
 assert.equal(spec.rows[2].section,'2026-11 · รวมเดือน');
});
test('weekly and monthly cost columns reconcile filtered actual values and export with the same amounts',()=>{
 const rows=[{...expense(100,'2026-11-01'),expenseType:'inventory'},{...expense(200,'2026-11-08'),id:100002,expenseType:'expense',payStatus:'paid',actualAmount:150},{...expense(20,'2026-11-08'),id:100003}],c=setup(rows);
 c.setRange('2026-11-01','2026-11-08');const summary=c.calendarMonthSummary('2026-11',rows);
 assert.equal(summary.month.inventory,100);assert.equal(summary.month.operatingExpense,150);assert.equal(summary.month.expense,270);assert.equal(summary.weeks[0].inventory,100);assert.equal(summary.weeks[1].operatingExpense,150);
 assert.equal(c.calendarMonthSummary('2026-11',rows.slice(1)).month.inventory,0);
 c.rangeDates=()=>['2026-11-01','2026-11-08'];vm.runInContext(fs.readFileSync('public/export-views.js','utf8'),c);const spec=c.ioCalendarExportSpec(rows),month=spec.rows.at(-1);
 assert.equal(month.inventory,100);assert.equal(month.operatingExpense,150);assert.ok(spec.cols.some(col=>col.label==='ต้นทุนขาย'));assert.ok(spec.cols.some(col=>col.label==='ค่าใช้จ่าย'));
});
