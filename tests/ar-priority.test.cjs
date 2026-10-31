const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {rawReportRuntime}=require('./helpers/raw-reports.cjs');
function setup(){
 const c=rawReportRuntime().context;
 Object.assign(c,{arAsOf:'2026-10-31',arInvoices:[],arPending:{},data:[],amount:x=>x.amount,localStorage:{getItem:()=>null},shiftDay:(date,days)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}});
 const ar=fs.readFileSync('public/ar.js','utf8');
 vm.runInContext(ar.slice(ar.indexOf("let arPriorityFilter="),ar.indexOf('function bangkokToday')),c);
 vm.runInContext(ar.slice(ar.indexOf('const arDays='),ar.indexOf('function arSave(')),c);
 vm.runInContext(ar.slice(ar.indexOf('function arTasks('),ar.indexOf('function arAlertHTML(')),c);
 const sheet=fs.readFileSync('public/ar-sheet.js','utf8');vm.runInContext(sheet.slice(0,sheet.indexOf('function arSheetDiscard(')),c);
 return c;
}
test('priority differentiates missed appointments, overdue tasks, upcoming work and settled invoices',()=>{
 const c=setup(),invoice={id:'I1',amount:1000,priorPaid:0,dueDate:'2026-11-30',insured:'no'};
 assert.equal(c.arPriority(invoice).key,'normal');
 assert.equal(c.arPriority({...invoice,promiseDate:'2026-10-30'}).key,'urgent');
 const upcoming={...invoice,dueDate:'2026-11-05'};assert.equal(c.arPriority(upcoming).key,'high');
 assert.equal(c.arPriority({...invoice,dueDate:'2026-10-01'}).key,'urgent');
 assert.equal(c.arPriority({...invoice,promiseDate:'2026-10-30',priorPaid:1000}).key,'closed');
 assert.equal(c.arPriority({...invoice,dueDate:''}).key,'normal');
 const original=JSON.stringify(invoice);c.arPriority(invoice);assert.equal(JSON.stringify(invoice),original);
 vm.runInContext("arPriorityFilter='urgent'",c);assert.equal(c.arPriorityMatches(invoice),false);assert.equal(c.arPriorityMatches({...invoice,promiseDate:'2026-10-30'}),true);
});
test('original worksheet order starts with company and code, with all fields available together',()=>{
 const c=setup(),all=c.arDisplayColumns();assert.deepEqual(Array.from(all.slice(0,8),col=>col[0]),['sourceCompany','sourceCustomerCode','shipmentDate','deliveryNo','billNo','customer','paymentBehavior','behaviorNote']);
 assert.equal(all.length,23);assert.equal(new Set(all.map(col=>col[0])).size,23);assert.equal(all.at(-1)[0],'sourceDocDate');assert.equal(c.arColumnViewHTML(),'');
});
