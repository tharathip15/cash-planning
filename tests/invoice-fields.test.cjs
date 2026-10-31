const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {rawReportRuntime}=require('./helpers/raw-reports.cjs');
test('existing source rows are corrected from exact source references without changing amounts or other companies',()=>{
 const c=rawReportRuntime().context,sales=[{company:'PF',code:'C1',bill:'B1',name:'Customer',date:'2026-01-31',amount:100},{company:'NV',code:'N1',bill:'N1',date:'2026-01-31',amount:25}];
 const ar=[{company:'PF',code:'C1',bill:'B1',date:'2026-01-31',due:'2026-03-01',balance:50}],receipts=[{company:'PF',code:'C1',bill:'B1',date:'2026-01-31',receivedDate:'2026-02-12',received:50}];
 const old={...c.rrBuild(sales,ar,[],receipts,2569,'2026-03-01'),rawSources:{sales:{rows:sales},ar:{rows:ar},receipts:{rows:receipts}}},reference={version:2,rows:[['PF','C1','B1','2026-01-31','2026-02-02','SO1',100]]};
 const next=c.reportUpgradeInvoiceFields(old,reference);
 assert.equal(next.rawSources.sales.rows[0].shipmentDate,'2026-01-31');assert.equal(next.rawSources.sales.rows[0].date,'2026-02-02');assert.equal(next.rawSources.sales.rows[0].deliveryNo,'SO1');
 assert.equal(next.rawSources.ar.rows[0].date,'2026-02-02');assert.equal(next.monthly.rows[0][7],10);
 assert.equal(next.checks.sales,old.checks.sales);assert.equal(next.checks.allAr,old.checks.allAr);assert.deepEqual(JSON.parse(JSON.stringify(next.rawSources.sales.rows[1])),sales[1]);assert.equal(old.rawSources.sales.rows[0].date,'2026-01-31');
 assert.equal(c.reportUpgradeInvoiceFields(next,reference),next);
 sales[0].amount=200;assert.equal(c.reportUpgradeInvoiceFields(old,reference),old);
});
test('AR Excel import and export keep shipment date, invoice date and order number distinct',()=>{
 const c=rawReportRuntime().context;
 for(const [file,prefix]of [['public/ar.js','const arFields='],['public/ar-sheet.js','const arSheetColumns=']])vm.runInContext(fs.readFileSync(file,'utf8').split('\n').find(line=>line.startsWith(prefix)),c);
 const schema=c.ioSchema('ar'),headers=['Shipping Date','Delivery No','Doc Date','Invoice Date','Sale Order No'];
 const map=c.ioGuessMap(headers,schema);assert.equal(map.shipmentDate,2);assert.equal(map.sourceDocDate,3);assert.equal(map.deliveryNo,4);
 Object.assign(c,{view:'ar-plan',arVisibleInvoices:()=>[{shipmentDate:'2026-01-31',sourceDocDate:'2026-02-02',deliveryNo:'SO1'}],periods:{},certainties:{},arDefault:()=>'',arOutstanding:()=>0});
 const exported=c.ioExportSpec();assert.equal(exported.rows[0].shipmentDate,'2026-01-31');assert.equal(exported.rows[0].sourceDocDate,'2026-02-02');assert.equal(exported.rows[0].deliveryNo,'SO1');assert.ok(exported.cols.some(column=>column.key==='sourceDocDate'&&column.label.includes('Invoice Date')));
});
test('all 5956 bundled sales invoices retain actual Doc Date, Invoice Date and Sale Order No',()=>{
 const c=rawReportRuntime().context,snapshot=c.reportDeserializeSnapshot(fs.readFileSync('public/reports-data.json','utf8')),reference=JSON.parse(fs.readFileSync('public/invoice-fields.json','utf8'));
 assert.equal(reference.rows.length,5956);assert.equal(snapshot.monthly.rows.length,501);
 assert.ok(snapshot.rawSources.sales.rows.every(row=>row.shipmentDate&&row.invoiceDate&&row.deliveryNo&&row.date===row.invoiceDate));
 assert.equal(snapshot.rawSources.sales.rows.filter(row=>row.shipmentDate!==row.invoiceDate).length,12);
});
