const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {rawReportRuntime}=require('./helpers/raw-reports.cjs');
function setup(){
 const c=rawReportRuntime().context;
 Object.assign(c,{arAsOf:'2026-11-02',arInvoices:[],data:[],amount:r=>r.amount,debtorCompany:value=>c.reportCompanyCode(value),shiftDay:(date,days)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}});
 const ar=fs.readFileSync('public/ar.js','utf8');
 vm.runInContext(ar.slice(ar.indexOf('const arDays='),ar.indexOf('function arSave(')),c);
 vm.runInContext(ar.slice(ar.indexOf('function arTasks('),ar.indexOf('function arAlertHTML(')),c);
 for(const file of ['reports.js','customer-calendar.js','ar-task-calendar.js'])vm.runInContext(fs.readFileSync('public/'+file,'utf8'),c);
 return c;
}
const invoice=(values={})=>({id:'A',sourceCompany:'PF',sourceCustomerCode:'C1',customer:'Customer',billNo:'B1',amount:1000,priorPaid:0,dueDate:'2026-09-28',insured:'no',logs:[],...values});
test('task view is first and default; policy work carries forward without changing invoice dates',()=>{
 const c=setup(),i=invoice({promiseDate:'2026-10-30'}),before=JSON.stringify(i),events=c.arTaskCalendarEvents([i]);
 assert.equal(vm.runInContext('arCalendarTab',c),'tasks');assert.ok(c.arCalendarTabs().indexOf('งานติดตามหนี้')<c.arCalendarTabs().indexOf('ยอดค้าง'));
 const letter=events.find(e=>e.key==='l1');assert.equal(letter.date,'2026-11-02');assert.equal(letter.deadline,'2026-11-02');assert.equal(letter.type,'letter');assert.equal(letter.status,'action');
 const missed=events.find(e=>e.key==='missed');assert.equal(missed.date,'2026-11-02');assert.equal(missed.status,'late');assert.equal(missed.deadline,'2026-10-30');
 const late=events.find(e=>e.key==='verify');assert.equal(late.date,'2026-11-02');assert.equal(late.status,'late');assert.equal(JSON.stringify(i),before);
 assert.equal(new Set(events.map(e=>e.id)).size,events.length);
});
test('completed letters use actual dates, stop carrying forward, and survive full settlement',()=>{
 const c=setup(),i=invoice({letter1:'2026-10-31',contactDate:'2026-10-29',priorPaid:1000,logs:[{date:'2026-10-30',by:'Alice',result:'Called customer'}]}),events=c.arTaskCalendarEvents([i]);
 assert.ok(events.every(e=>e.done));assert.equal(events.find(e=>e.key==='l1').date,'2026-10-31');assert.equal(events.find(e=>e.key==='l1').status,'done');assert.equal(events.find(e=>e.key==='log-0').owner,'Alice');assert.ok(!events.some(e=>e.type==='promise'||e.type==='missed'));
});
test('future letters retain policy dates, and undated invoices do not acquire invented deadlines',()=>{
 const c=setup(),events=c.arTaskCalendarEvents([invoice({dueDate:'2026-11-30',promiseDate:'2026-11-20'})]);
 assert.equal(events.find(e=>e.key==='l1').date,'2026-12-30');assert.equal(events.find(e=>e.key==='l1').deadline,'2027-01-04');
 const undated=c.arTaskCalendarEvents([invoice({dueDate:'',promiseDate:''})]);assert.equal(undated.length,0);
 const promise=c.arTaskCalendarEvents([invoice({dueDate:'',promiseDate:'2026-11-20'})]);assert.equal(promise.length,1);assert.equal(promise[0].type,'promise');
});
test('appointment totals do not multiply by work count and company boundaries stay separate',()=>{
 const c=setup(),events=c.arTaskCalendarEvents([invoice({promiseDate:'2026-11-02'}),invoice({id:'N',sourceCompany:'NV',promiseDate:'2026-11-02',amount:2000})]);
 assert.ok(events.length>2);assert.equal(c.arTaskCalendarStats(events).promiseAmount,3000);
 vm.runInContext("Object.assign(arTaskCalendarState,{company:'NV',type:'promise',status:'open',owner:'L1'})",c);let filtered=c.arTaskCalendarFilter(events);assert.equal(filtered.length,1);assert.equal(filtered[0].invoiceId,'N');assert.equal(c.arTaskCalendarStats(filtered).promiseAmount,2000);
 vm.runInContext("arTaskCalendarState.status='done'",c);assert.equal(c.arTaskCalendarFilter(events).length,0);
});
test('task inputs honor search and priority but do not lose overdue work to the old promise-date range',()=>{
 const c=setup();c.arInvoices=[invoice(),invoice({id:'N',sourceCompany:'NV'})];c.sourceInvoiceVisible=i=>i.sourceCompany==='PF';c.arPriorityMatches=()=>true;c.arInvoiceMatch=()=>true;c.arInvoiceInRange=()=>false;
 assert.equal(c.arTaskCalendarInvoices().length,1);c.arInvoiceMatch=()=>false;assert.equal(c.arTaskCalendarInvoices().length,0);
});
test('task calendar export matches month and filters; daily logs remove the pending daily task',()=>{
 const c=setup();c.arInvoices=[invoice({letter1:'2026-11-01',logs:[{date:'2026-11-02',by:'Alice',result:'Done'}]})];
 const events=c.arTaskCalendarEvents(c.arInvoices);assert.ok(!events.some(e=>e.key==='daily'));assert.ok(events.some(e=>e.key==='log-0'&&e.done));
 vm.runInContext("Object.assign(arTaskCalendarState,{month:'2026-11',type:'letter',status:'done'})",c);const spec=c.arTaskCalendarExportSpec();assert.equal(spec.rows.length,1);assert.equal(spec.rows[0].date,'2026-11-01');assert.equal(spec.rows[0].state,'ทำแล้ว');
});
test('calendar view dropdown changes the calendar data and keeps the task view as default',()=>{
 const c=setup(),input={value:'outstanding'};let renders=0;c.$=()=>input;c.arRender=()=>renders++;
 assert.ok(c.arCalendarTabs().includes('value="tasks" selected'));assert.ok(!c.arCalendarTabs().includes('role="tab"'));
 c.bindArCalendarTabs();input.onchange();assert.equal(vm.runInContext('arCalendarTab',c),'outstanding');assert.equal(renders,1);
 input.value='tasks';input.onchange();assert.equal(vm.runInContext('arCalendarTab',c),'tasks');assert.equal(renders,2);
 input.value='invalid';input.onchange();assert.equal(vm.runInContext('arCalendarTab',c),'tasks');assert.equal(renders,2);
});
test('company, work type, owner, status, priority and search combine in calendar and export',()=>{
 const c=setup(),ar=fs.readFileSync('public/ar.js','utf8');
 vm.runInContext(ar.slice(ar.indexOf('let arPriorityFilter='),ar.indexOf('function bangkokToday')),c);
 c.arInvoices=[invoice({promiseDate:'2026-10-30'}),invoice({id:'N',sourceCompany:'NV',promiseDate:'2026-10-30'}),invoice({id:'F',dueDate:'2027-01-01',sourceCompany:'NV'})];
 c.includeAffiliates=false;c.sourceInvoiceVisible=i=>c.includeAffiliates||i.id!=='F';c.query='';c.arInvoiceMatch=i=>!c.query||i.billNo.includes(c.query);
 vm.runInContext("arPriorityFilter='urgent';Object.assign(arTaskCalendarState,{month:'2026-11',company:'NV',type:'missed',owner:'L1',status:'late'})",c);
 let spec=c.arTaskCalendarExportSpec();assert.equal(spec.rows.length,1);assert.equal(spec.rows[0].invoiceId,'N');assert.equal(spec.rows[0].type,'missed');
 c.query='missing';assert.equal(c.arTaskCalendarExportSpec().rows.length,0);c.query='';
 vm.runInContext("arPriorityFilter='normal'",c);assert.equal(c.arTaskCalendarExportSpec().rows.length,0);
 c.includeAffiliates=true;assert.ok(c.arTaskCalendarInvoices().some(i=>i.id==='F'));
});
test('priority is placed beside calendar view in the header, not in the task toolbar',()=>{
 const c=setup();c.arPriorityFilterHTML=()=>'<label>ความสำคัญ<select id="ar-priority-filter"></select></label>';
 Object.assign(c,{arSearch:'',arSearchColumn:'all',arNoticeList:()=>[],arSearchColumnsMap:()=>({all:'ทุกคอลัมน์'}),searchSelectHTML:()=>'<select id="ar-search-column"></select>'});
 const html=c.arTaskCalendarHTML(),toolbar=c.arTaskCalendarToolbarHTML();const header=html.slice(html.indexOf('<div class="panelhead">'),html.indexOf('<p class="customer-calendar-note">'));assert.ok(header.includes('id="ar-priority-filter"'));assert.ok(header.indexOf('id="ar-calendar-view"')<header.indexOf('id="ar-priority-filter"'));assert.equal((html.match(/id="ar-priority-filter"/g)||[]).length,1);assert.ok(!toolbar.includes('ar-priority-filter'));assert.ok(toolbar.includes('ar-calendar-toolbar-search'));assert.ok(toolbar.includes('ar-calendar-toolbar-date'));
});
test('work today retains selected company, type, owner and status filters',()=>{
 const c=setup(),elements=new Map();c.$=key=>{if(!elements.has(key))elements.set(key,{});return elements.get(key)};c.document={querySelectorAll:()=>[]};c.bangkokToday=()=> '2026-11-02';c.arRender=()=>{};
 let opened;c.arTaskCalendarOpen=events=>opened=events;c.arInvoices=[invoice({promiseDate:'2026-10-30'})];
 vm.runInContext("Object.assign(arTaskCalendarState,{company:'PF',type:'missed',owner:'L1',status:'late'})",c);c.bindArTaskCalendar();c.$('#ar-task-today').onclick();
 assert.equal(opened.length,1);assert.equal(opened[0].type,'missed');assert.equal(vm.runInContext('arTaskCalendarState.type',c),'missed');assert.equal(vm.runInContext('arTaskCalendarState.status',c),'late');
});
test('daily priority badges count pending work once and carry policy priority into details and export',()=>{
 const c=setup(),ar=fs.readFileSync('public/ar.js','utf8');vm.runInContext(ar.slice(ar.indexOf('let arPriorityFilter='),ar.indexOf('function bangkokToday')),c);
 const events=c.arTaskCalendarEvents([invoice({promiseDate:'2026-10-30'})]),today=events.filter(e=>e.date==='2026-11-02');assert.ok(today.every(e=>e.priority==='urgent'));
 const html=c.arTaskCalendarPriorityHTML('2026-11-02',[...today,{...today[0],done:true}]);assert.ok(html.includes('data-ar-priority-key="urgent"'));assert.ok(html.includes(today.length+' งาน'));assert.ok(!html.includes('data-ar-priority-key="normal"'));assert.equal(c.arTaskCalendarPriorityHTML('2026-11-02',[{...today[0],done:true}]),'');
 const spec=c.arTaskCalendarSpec(today);assert.ok(spec.rows.every(e=>e.priorityLabel==='เร่งด่วน'));assert.ok(spec.cols.some(col=>col.key==='priorityLabel'));
});
test('task range applies to work counts and export across month boundaries without changing report range',()=>{
 const c=setup();c.arInvoices=[invoice({letter1:'2026-10-31',contactDate:'2026-11-02',logs:[{date:'2026-11-03',by:'A',result:'Follow up'}],priorPaid:1000})];
 assert.equal(c.calendarApplyRange('tasks','2026-10-31','2026-11-02'),true);const spec=c.arTaskCalendarExportSpec();assert.equal(spec.rows.length,2);assert.ok(spec.rows.every(r=>r.date>='2026-10-31'&&r.date<='2026-11-02'));assert.equal(vm.runInContext('calendarRanges.report',c),null);
});
test('outstanding and appointment views use different dates and remember independent ranges',()=>{
 const c=setup(),bill=invoice({dueDate:'2026-10-15',promiseDate:'2026-11-20'});
 assert.equal(c.arCalendarSelectView('outstanding'),true);assert.equal(c.customerCalendarRecords('ar',[bill])[0].date,'2026-10-15');c.calendarApplyRange('ar','2026-10-01','2026-10-31');
 c.arCalendarSelectView('promise');assert.equal(c.customerCalendarRecords('ar',[bill])[0].date,'2026-11-20');c.calendarApplyRange('ar','2026-11-01','2026-11-30');
 c.arCalendarSelectView('outstanding');assert.equal(vm.runInContext('calendarRanges.ar.start',c),'2026-10-01');assert.equal(c.customerCalendarRecords('ar',[bill])[0].date,'2026-10-15');
 c.arCalendarSelectView('promise');assert.equal(vm.runInContext('calendarRanges.ar.start',c),'2026-11-01');assert.equal(c.customerCalendarRecords('ar',[bill])[0].date,'2026-11-20');assert.ok(!c.arCalendarTabs().includes('ยอดค้าง / วันนัดรับ'));
});
