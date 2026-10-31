const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function layout(rows){const window={},context=vm.createContext({window,document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:()=>null}});vm.runInContext(fs.readFileSync('public/table-layout.js','utf8'),context);return window.CashTables.headerLayout(rows)}
const cell=(colSpan=1,rowSpan=1)=>({colSpan,rowSpan});
test('monthly report spanning headers map every month, total and overdue column to a unique data column',()=>{
 const a=cell(1,2),month1=cell(2),month2=cell(2),total1=cell(1,2),total2=cell(1,2),overdue=cell(1,2),status=cell(1,2),leaf=[cell(),cell(),cell(),cell()];
 const result=layout([{cells:[a,month1,month2,total1,total2,overdue,status]},{cells:leaf}]);
 assert.equal(result.count,9);assert.deepEqual(Array.from(result.cells.filter(item=>leaf.includes(item.cell)),item=>item.column),[1,2,3,4]);assert.equal(result.cells.find(item=>item.cell===overdue).column,7);
});
test('AR headers use all columns without compressing identity fields into the previous layout',()=>{
 const result=layout([{cells:Array.from({length:29},()=>cell())}]);assert.equal(result.count,29);assert.deepEqual(Array.from(result.cells,item=>item.column),Array.from({length:29},(_,index)=>index));
});
test('page windows include every row once and clamp the last page after filtering',()=>{
 const window={},context=vm.createContext({window,document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:()=>null}});vm.runInContext(fs.readFileSync('public/table-layout.js','utf8'),context);
 const {pageWindow,getPageSize}=window.CashTables;assert.equal(getPageSize(),50);
 const windows=[0,1,2].map(page=>pageWindow(101,page,50));assert.deepEqual(windows.map(w=>[w.start,w.end]),[[0,50],[50,100],[100,101]]);
 assert.equal(pageWindow(10,7,50).page,0);assert.equal(pageWindow(501,0,Number.MAX_SAFE_INTEGER).end,501);assert.equal(pageWindow(0,0,50).end,0);
 context.localStorage.getItem=()=> '250';assert.equal(getPageSize(),250);context.localStorage.getItem=()=> 'all';assert.equal(getPageSize(),Number.MAX_SAFE_INTEGER);
});
test('compact column widths adapt to all screen sizes while keeping dates, amounts and customer identity readable',()=>{
 const window={},context=vm.createContext({window,document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:()=>null}});vm.runInContext(fs.readFileSync('public/table-layout.js','utf8'),context);
 const {compactWidth,screenBand}=window.CashTables;
 assert.equal(screenBand(390),'mobile');assert.equal(screenBand(1024),'tablet');assert.equal(screenBand(1440),'desktop');
 assert.equal(compactWidth('รหัสลูกค้า',140,1024),82);assert.equal(compactWidth('ลูกค้า',240,1024),145);
 assert.equal(compactWidth('วันที่บิล (Invoice Date)',170,390),110);assert.equal(compactWidth('ยอดขาย',200,390),96);
 assert.ok(compactWidth('หมายเหตุ',300,1024)<compactWidth('หมายเหตุ',300,1440));
 assert.equal(compactWidth('จำนวนวันรับเงินจริง',200,1024),82);assert.equal(compactWidth('#',50,1440),44);
});
test('weekly summary columns fill the container and keep a readable minimum on narrow screens',()=>{
 const window={},context=vm.createContext({window,document:{readyState:'loading',addEventListener(){}},localStorage:{getItem:()=>null}});vm.runInContext(fs.readFileSync('public/table-layout.js','utf8'),context);
 const fit=window.CashTables.fitColumnWidths,widths=[170,140,140,140,140];
 assert.equal(Math.round(fit(widths,1200,670).reduce((sum,width)=>sum+width,0)),1200);
 assert.equal(Math.round(fit(widths,800,670).reduce((sum,width)=>sum+width,0)),800);
 assert.equal(Math.round(fit(widths,390,670).reduce((sum,width)=>sum+width,0)),730);
 assert.equal(widths[0],170);assert.ok(Math.abs(fit(widths,1200)[0]/fit(widths,1200)[1]-170/140)<1e-10);
});
