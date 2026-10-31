const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
 const stored = {};
 const context = vm.createContext({ console, Date, Intl,
  view: 'list', data: [], rangeStart: '2026-11-01', rangeEnd: '2026-11-30',
  query: '', cashSearchColumn: 'all', periodFilter: 'all', opening: '',
  esc: value => String(value).replaceAll('"', '&quot;'), money: String,
  periods: { unset: 'ยังไม่ระบุ', am: 'เช้า', pm: 'บ่าย' },
  certainties: { uncertain: 'ยังไม่ชัวร์', confirmed: 'รับชัวร์', received: 'รับแล้ว' },
  payStatuses: { uncertain: 'ยังไม่ชัวร์', confirmed: 'จ่ายชัวร์', paid: 'จ่ายแล้ว' },
  amount: row => row.actualAmount ?? row.amount,
  groupName: row => row.type === 'out' ? 'จ่ายเงินสด' : 'รับเงินสด',
  $: () => ({ value: 'skip', textContent: '' }),
  localStorage: { setItem(key, value) { stored[key] = value; } },
 });
 const app = fs.readFileSync('public/app.js', 'utf8');
 vm.runInContext(fs.readFileSync('public/workspace-guide.js', 'utf8'), context);
 vm.runInContext(fs.readFileSync('public/counterparty-fields.js','utf8'),context);
 vm.runInContext(app.split('\n').filter(line => /^const (expenseTypes|businessUnits)=/.test(line)).join('\n'), context);
 const grid = fs.readFileSync('public/grid.js', 'utf8');
 vm.runInContext(grid.slice(0, grid.indexOf('let pasteBatch=')), context);
 const excel = fs.readFileSync('public/excel-io.js', 'utf8');
 vm.runInContext(fs.readFileSync('public/export-views.js', 'utf8'), context);
 vm.runInContext(excel.slice(0, excel.indexOf("document.body.insertAdjacentHTML")), context);
 context.visibleRows = rows => rows.filter(row => context.periodFilter === 'all' || row.period === context.periodFilter);
 context.monthRows = () => context.data;
 context.cashRowMatch = () => true;
 return { context, stored, app };
}

test('payment account follows item in both headers and editable cells; income keeps its fields', () => {
 const { context } = setup();
 const row = { ...context.freshSheetRow('2026-11-01'), principal: 100, interestExpense: 5, expenseType: 'expense', businessUnit: 'Finance' };
 const html = context.sheetTable([row]);
 assert.match(html, /B · รายการ<\/th><th[^>]*>C · เลขที่บัญชี<\/th><th[^>]*>D · Supplier/);
 assert.match(html, /E · ยอด \(บาท\)<\/th><th[^>]*>F · เงินต้น/);
 const keys=[...html.matchAll(/data-grid-key="([^"]+)"/g)].map(match=>match[1]);
 assert.deepEqual(keys.slice(0,5),['date','group','bankAccount','party','amount']);
 for (const field of ['principal', 'interestExpense', 'expenseType', 'businessUnit']) assert.match(html, new RegExp(`data-grid-key="${field}"`));
 assert.match(html, /value="Finance" selected/);
 assert.match(html, /value="expense" selected/);
 context.view = 'income';
 assert.doesNotMatch(context.sheetTable([{ ...row, type: 'in' }]), /data-grid-key="principal"/);
});

test('validates optional amounts, zero, Thai expense labels and all BU choices', () => {
 const { context } = setup();
 assert.equal(context.paymentDetails({}).principal, '');
 assert.equal(context.paymentDetails({ principal: '1,200.50', interestExpense: 0, expenseType: 'ต้นทุนสินค้า', businessUnit: 'sales' }).principal, 1200.5);
 assert.equal(context.paymentDetails({ expenseType: 'ค่าใช้จ่าย' }).expenseType, 'expense');
 for (const businessUnit of ['Sales', 'Procurment', 'Corporate', 'HR', 'Finance']) assert.equal(context.paymentDetails({ businessUnit }).businessUnit, businessUnit);
 for (const principal of ['-1', 'abc', 'Infinity']) assert.throws(() => context.paymentDetails({ principal }));
 assert.throws(() => context.paymentDetails({ businessUnit: 'Unknown' }));
});

test('Excel maps ประเภท to expense type, preserves numeric blanks and exports extra columns', () => {
 const { context } = setup();
 const schema = vm.runInContext("ioSchema('out')", context);
 const map = context.ioGuessMap(['วันที่', 'รายการ', 'Supplier/Customer', 'จำนวนเงิน', 'เงินต้น', 'ดอกเบี้ยจ่าย', 'ประเภท', 'BU'], schema);
 assert.equal(map.group, 1);
 assert.equal(map.expenseType, 6);
 context.data = [{ ...context.freshSheetRow('2026-11-01'), amount: 105, principal: 100, interestExpense: 5, expenseType: 'inventory', businessUnit: 'Procurment' }];
 const exported = context.ioExportSpec();
 assert.equal(exported.rows[0].amount, 105);
 assert.equal(exported.rows[0].principal, 100);
 assert.equal(exported.rows[0].expenseType, 'ต้นทุนสินค้า');
 assert.deepEqual(Array.from(exported.cols.slice(0,6),col=>col.key),['date','group','bankAccount','party','amount','principal']);
 context.view = 'income';
 assert.ok(!context.ioExportSpec(true).cols.some(col => col.key === 'principal'));
});

test('new and old Excel imports retain payment details without changing the total', () => {
 const { context } = setup();
 const old = { ...context.freshSheetRow('2026-11-01'), id: 1, amount: 105, principal: 100, interestExpense: 5, expenseType: 'expense', businessUnit: 'Finance' };
 context.data = [old];
 context.$ = () => ({ value: 'update' });
 context.importRow = { date: old.date, group: 'จ่ายเงินสด', amount: 200, planAmount: '', status: 'uncertain', period: 'am', party: 'Supplier', note: '', id: '1' };
 vm.runInContext("ioState={kind:'out',map:{},fileName:'test.xlsx'}; ioConvertRows=()=>({converted:[{row:importRow,index:2}],errors:[]})", context);
 let plan = context.ioBuildPlan();
 assert.equal(plan.errors.length, 0);
 assert.equal(plan.changes[0].value.principal, 100);
 context.$ = () => ({ value: 'skip' });
 context.importRow = { ...context.importRow, id: '', principal: 190, interestExpense: 10, expenseType: 'ต้นทุนสินค้า', businessUnit: 'HR' };
 plan = context.ioBuildPlan();
 assert.equal(plan.errors.length, 0);
 assert.equal(plan.changes[0].value.amount, 200);
 assert.equal(plan.changes[0].value.principal, 190);
 assert.equal(plan.changes[0].value.expenseType, 'inventory');
});

test('Excel paste accepts new 11-column layout and original 7-column layout', () => {
 const { context } = setup();
 const expanded = context.parseSheetPaste('2026-11-01\tจ่ายเงินสด\tSupplier\t105\t100\t5\tค่าใช้จ่าย\tFinance\tเช้า\tยังไม่ชัวร์\tหมายเหตุ');
 assert.equal(expanded.errors.length, 0);
 assert.equal(expanded.rows[0].principal, 100);
 assert.equal(expanded.rows[0].businessUnit, 'Finance');
 const legacy = context.parseSheetPaste('2026-11-01\tจ่ายเงินสด\tSupplier\t105\tเช้า\tยังไม่ชัวร์\tหมายเหตุ');
 assert.equal(legacy.errors.length, 0);
 assert.equal(legacy.rows[0].principal, '');
 const bank=context.parseSheetPaste('2026-11-01\tจ่ายเงินสด\tSupplier\t105\t100\t5\tค่าใช้จ่าย\tFinance\t001-2-34567-8\tเช้า\tยังไม่ชัวร์\tหมายเหตุ');
 assert.equal(bank.errors.length,0);assert.equal(bank.rows[0].bankAccount,'001-2-34567-8');
 const income=context.parseSheetPaste('2026-11-01\tรับเครดิต\tCustomer\t105\tเช้า\tยังไม่ชัวร์\tหมายเหตุ\tจ่ายตามวันนัด\tวันที่ 15');
 assert.equal(income.errors.length,0);assert.equal(income.rows[0].paymentBehavior,'on_promise');
});

test('an AR note-only Excel update preserves shared behavior that was edited in income',()=>{
 const {context}=setup(),invoice={id:'ar1',customer:'Acme',billNo:'B1',sourceCompany:'โปรเฟส',sourceCustomerCode:'C1',amount:100,priorPaid:0};
 context.arInvoices=[invoice];context.arPending={};context.arNewDraft=()=>({});context.arValidateBatch=()=>({errors:[]});
 context.setCustomerBehavior({id:1,party:'Acme',arInvoiceId:'ar1'},'paymentBehavior','early');
 context.$=()=>({value:'update'});
 context.importRow={customer:'Acme',billNo:'B1',behaviorNote:'ทุกวันที่ 15'};
 vm.runInContext("ioState={kind:'ar',map:{behaviorNote:2},fileName:'test.xlsx'};ioConvertRows=()=>({converted:[{row:importRow,index:2}],errors:[]})",context);
 const plan=context.ioBuildPlan();assert.equal(plan.errors.length,0);
 assert.equal(plan.changes[0].value.paymentBehavior,'early');assert.equal(plan.changes[0].value.behaviorNote,'ทุกวันที่ 15');
});

test('reimporting a cash envelope preserves its original plan instead of subtracting spending twice',()=>{
 const {context}=setup();
 context.recordAmount=row=>row.actualAmount??row.amount;
 vm.runInContext(fs.readFileSync('public/cash-calendar.js','utf8'),context);
 const old={...context.freshSheetRow('2026-11-01'),id:28,name:'ซัพเงินสด',party:'ซัพเงินสด',amount:3000000};
 context.data=[old,{...context.freshSheetRow(old.date),id:100001,amount:100000}];
 context.$=()=>({value:'update'});
 context.importRow={date:old.date,group:'จ่ายเงินสด',amount:2900000,planAmount:3000000,status:'uncertain',period:'unset',party:old.party,note:'',id:'28'};
 vm.runInContext("ioState={kind:'out',map:{planAmount:6},fileName:'test.xlsx'};ioConvertRows=()=>({converted:[{row:importRow,index:2}],errors:[]})",context);
 const plan=context.ioBuildPlan();
 assert.deepEqual(Array.from(plan.errors),[]);
 assert.equal(plan.changes[0].value.amount,3000000);
 assert.equal(context.cashBudgetAmount(plan.changes[0].value,context.data),2900000);
});

test('save persists fields for both original and newly added records', () => {
 const { context, stored, app } = setup();
 const fields = { principal: 100, interestExpense: 5, expenseType: 'expense', businessUnit: 'Finance' };
 context.data = [{ id: 1, ...fields }, { id: 100001, ...fields }];
 vm.runInContext(app.slice(app.indexOf('function save()'), app.indexOf('const payStatuses=')), context);
 context.save();
 assert.equal(JSON.parse(stored['profess-edits-v2'])['1'].principal, 100);
 assert.equal(JSON.parse(stored['profess-added-v1'])[0].businessUnit, 'Finance');
});

test('editing a paid record saves its breakdown while preserving confirmed amount', () => {
 const { context } = setup();
 const record = { ...context.freshSheetRow('2026-11-01'), id: 1, amount: 105, actualAmount: 105, payStatus: 'paid' };
 context.data = [record];
 const row = { dataset: {}, classList: { toggle() {} } };
 const element = { dataset: { gridId: '1', gridKey: 'principal' }, value: '100', tagName: 'INPUT', closest: () => row,
  setCustomValidity(value) { this.validationMessage = value; }, reportValidity() {},
 };
 context.document = { querySelectorAll: selector => selector==='[data-grid-id]'?[element]:[],querySelector:()=>null };
 let saved = 0;
 context.save = () => saved++;
 context.bindSheet();
 element.onchange({ type: 'change' });
 assert.equal(record.principal, 100);
 assert.equal(record.actualAmount, 105);
 assert.equal(saved, 1);
 element.value = '-2';
 element.onchange({ type: 'change' });
 assert.equal(record.principal, 100);
 assert.equal(saved, 1);
});

test('import skips an existing row when optional fields are not mapped', () => {
 const { context } = setup();
 const old = { ...context.freshSheetRow('2026-11-01'), id: 1, party: 'Supplier A', category: 'unset', period: 'pm', amount: 105, note: 'ยอดวางแผนเดิม' };
 context.data = [old];
 context.importRow = { date: old.date, amount: 105, party: ' Supplier   A ', group: '', period: 'unset', status: 'uncertain', planAmount: '', note: '', id: '' };
 vm.runInContext("ioState={kind:'out',map:{date:0,party:1,amount:2},fileName:'test.xlsx'};ioConvertRows=()=>({converted:[{row:importRow,index:2}],errors:[]})", context);
 const plan = context.ioBuildPlan();
 assert.equal(plan.errors.length, 0);
 assert.equal(plan.changes.length, 0);
 assert.equal(plan.skipped, 1);
});

test('uncertain matches block import instead of creating another payment', () => {
 const { context } = setup();
 const old = { ...context.freshSheetRow('2026-11-01'), id: 1, party: 'Supplier A', amount: 105, period: 'pm', note: 'original' };
 const incoming = { ...old, id: 2, period: 'am', note: 'changed' };
 assert.throws(() => context.ioFindCashMatch(incoming, '', [old], { party: 1, period: 2, note: 3 }), /อาจซ้ำ/);
 assert.throws(() => context.ioFindCashMatch(incoming, 'external-id', [old], { party: 1 }), /เลขรายการในไฟล์ไม่ตรง/);
 assert.throws(() => context.ioFindCashMatch({ ...incoming, party: '' }, '', [old], {}), /Supplier\/Customer/);
});

test('reupload after editing an imported record uses its original import identity', () => {
 const { context, stored, app } = setup();
 context.importRow = { date: '2026-11-01', amount: 105, party: 'Supplier A', group: 'จ่ายเงินสด', period: 'am', status: 'uncertain', planAmount: '', note: 'original', id: '' };
 vm.runInContext("ioState={kind:'out',map:{date:0,party:1,amount:2,group:3,period:4,note:5},fileName:'test.xlsx'};ioConvertRows=()=>({converted:[{row:importRow,index:2}],errors:[]})", context);
 const first = context.ioBuildPlan();
 assert.equal(first.errors.length, 0);
 assert.equal(first.changes.length, 1);
 const record = first.changes[0].value;
 record.id = 1; // Exercise the original-record storage path as well as added rows.
 record.note = 'edited in browser';
 record.amount = 200;
 context.data = [record];
 vm.runInContext(app.slice(app.indexOf('function save()'), app.indexOf('const payStatuses=')), context);
 context.save();
 const restored = JSON.parse(stored['profess-edits-v2'])['1'];
 assert.equal(restored.excelImportKey, record.excelImportKey);
 context.data = [{ ...record, ...restored }];
 const second = context.ioBuildPlan();
 assert.equal(second.errors.length, 0);
 assert.equal(second.changes.length, 0);
 assert.equal(second.skipped, 1);
 assert.equal(context.data[0].amount, 200);
});

test('different source IDs and punctuation in supplier names stay distinct', () => {
 const { context } = setup();
 const first = { ...context.freshSheetRow('2026-11-01'), id: 1, excelSourceId: 'bill-a', party: 'A-B', amount: 105 };
 assert.equal(context.ioFindCashMatch({ ...first, excelSourceId: 'bill-b' }, 'bill-b', [first], { party: 0 }), null);
 assert.equal(context.ioFindCashMatch({ ...first, party: 'AB' }, '', [first], { party: 0 }), null);
 assert.equal(context.ioFindCashMatch(first, '1', [first], {}).id, 1);
 assert.equal(context.ioFindCashMatch({ ...first, id: 0 }, '0', [{ ...first, id: 0 }], {}).id, 0);
});

test('repeated file rows are skipped and update mode rejects blank record IDs', () => {
 const { context } = setup();
 context.importRow = { date: '2026-11-01', amount: 105, party: 'Supplier A', group: 'จ่ายเงินสด', period: 'am', status: 'uncertain', planAmount: '', note: '', id: '' };
 vm.runInContext("ioState={kind:'out',map:{date:0,party:1,amount:2},fileName:'test.xlsx'};ioConvertRows=()=>({converted:[{row:importRow,index:2},{row:importRow,index:3}],errors:[]})", context);
 let plan = context.ioBuildPlan();
 assert.equal(plan.errors.length, 0);
 assert.equal(plan.changes.length, 1);
 assert.equal(plan.skipped, 1);
 context.$ = () => ({ value: 'update' });
 plan = context.ioBuildPlan();
 assert.equal(plan.changes.length, 0);
 assert.equal(plan.errors.length, 2);
 assert.match(plan.errors[0], /ต้องมีเลขรายการในทุกแถว/);
});

test('cash exports follow the active module, period filter, search and date range', () => {
 const { context } = setup();
 context.data = [
  { ...context.freshSheetRow('2026-11-01'), id: 1, type: 'out', party: 'A', amount: 100, period: 'am' },
  { ...context.freshSheetRow('2026-11-01'), id: 2, type: 'out', party: 'A', amount: 20, period: 'pm' },
  { ...context.freshSheetRow('2026-11-01'), id: 3, type: 'in', party: 'A', amount: 30, period: 'am' },
  { ...context.freshSheetRow('2026-11-01'), id: 4, type: 'out', party: 'B', amount: 40, period: 'am' },
  { ...context.freshSheetRow('2026-12-01'), id: 5, type: 'out', party: 'A', amount: 50, period: 'am' },
 ];
 context.monthRows = () => context.data.filter(row => row.date >= context.rangeStart && row.date <= context.rangeEnd);
 context.cashRowMatch = row => row.party === 'A';
 context.periodFilter = 'am';
 assert.deepEqual(Array.from(context.ioExportSpec().rows, row => row.id), ['1']);
 context.view = 'income';
 assert.deepEqual(Array.from(context.ioExportSpec().rows, row => row.id), ['3']);
 context.view = 'list';
 assert.equal(context.ioExportSpec(true).rows.length, 0);
});

test('overview and calendar exports contain module summaries, with blank unknown balances', () => {
 const { context } = setup();
 const rows = [
  { date: '2026-11-01', type: 'in', category: 'cash', amount: 100, certainty: 'confirmed' },
  { date: '2026-11-01', type: 'in', category: 'cash', amount: 50, certainty: 'uncertain' },
  { date: '2026-11-02', type: 'out', category: 'cash', amount: 30 },
 ];
 context.dashboardRows = () => rows;
 context.rangeDates = () => ['2026-11-01', '2026-11-02'];
 context.sum = (selected, type) => selected.filter(row => row.type === type).reduce((n, row) => n + context.amount(row), 0);
 context.mainIncome = selected => context.sum(selected.filter(row => row.certainty !== 'uncertain'), 'in');
 context.uncertainIncome = selected => context.sum(selected.filter(row => row.certainty === 'uncertain'), 'in');
 context.view = 'overview';
 let spec = context.ioExportSpec();
 assert.equal(spec.name, 'ภาพรวมเงินสด');
 assert.equal(spec.rows[0].income, 100);
 assert.equal(spec.rows[0].uncertain, 50);
 assert.equal(spec.rows[0].balance, '');
 context.opening = '10';
 spec = context.ioExportSpec();
 assert.equal(spec.rows[0].balance, 80);
 assert.equal(spec.rows[2].opening, 110);
 assert.equal(spec.rows[2].balance, 80);
 context.view = 'calendar';
 spec = context.ioExportSpec();
 assert.equal(spec.name, 'ปฏิทินรับจ่าย');
 assert.equal(spec.rows.length, 2);
 assert.equal(spec.rows[0].income, 100);
 assert.equal(spec.rows[0].net, 100);
 assert.equal(spec.rows[1].net, -30);
});

test('card export accepts only selected records and worksheet names remain valid', () => {
 const { context } = setup();
 const selected = [{ ...context.freshSheetRow('2026-11-02'), id: 1, amount: 20 }];
 const spec = context.ioCashRecordSpec(selected, 'จ่ายเงินสด / ช่วงเช้า', 'out');
 assert.equal(spec.rows.length, 1);
 assert.equal(spec.rows[0].amount, 20);
 assert.ok(!context.ioSafeSheetName('ชื่อรายงาน: '+ 'x'.repeat(40)).includes(':'));
 assert.ok(context.ioSafeSheetName('ชื่อรายงาน: '+ 'x'.repeat(40)).length <= 31);
 assert.equal(context.ioSafeFileName('รับ/จ่าย:ทั้งหมด'), 'รับ-จ่าย-ทั้งหมด');
});

test('generated Excel contains the selected module and preserves numeric and blank values', async () => {
 const { context } = setup();
 Object.assign(context, { setTimeout, clearTimeout, setImmediate, clearImmediate, Uint8Array, ArrayBuffer, Buffer });
 vm.runInContext(fs.readFileSync('public/vendor/xlsx.full.min.js', 'utf8'), context);
 vm.runInContext(fs.readFileSync('public/vendor/jszip.min.js', 'utf8'), context);
 const spec = context.ioCashRecordSpec([{ ...context.freshSheetRow('2026-11-02'), id: 1, amount: 105, principal: 100, interestExpense: 5, businessUnit: 'Finance',bankAccount:'001-2-34567-8' }], 'รายการจ่าย / เฉพาะเช้า', 'out');
 const bytes = await context.ioWorkbookBytes(spec);
 const book = context.XLSX.read(bytes, { type: 'array' });
 assert.equal(book.SheetNames[0], 'รายการจ่าย   เฉพาะเช้า');
 const sheet = book.Sheets[book.SheetNames[0]];
 const values = context.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
 assert.equal(values.length, 2);
 const cell=key=>values[1][spec.cols.findIndex(col=>col.key===key)];
 assert.equal(cell('amount'),105);
 assert.equal(cell('principal'),100);
 assert.equal(cell('interestExpense'),5);
 assert.equal(cell('businessUnit'),'Finance');
 assert.equal(cell('bankAccount'),'001-2-34567-8');
 assert.equal(spec.cols[2].key,'bankAccount');
 const archive = await context.JSZip.loadAsync(bytes);
 assert.match(await archive.file('xl/worksheets/sheet1.xml').async('string'), /state="frozen"/);
 const summary = { kind: 'summary', name: 'ภาพรวมเงินสด', cols: [{ key: 'balance', label: 'คงเหลือ', type: 'number' }], rows: [{ balance: '' }, { balance: -30 }] };
 const summaryBook = context.XLSX.read(await context.ioWorkbookBytes(summary), { type: 'array' });
 const summaryValues = context.XLSX.utils.sheet_to_json(summaryBook.Sheets['ภาพรวมเงินสด'], { header: 1, defval: '', blankrows: true });
 assert.equal(summaryValues[1][0], '');
 assert.equal(summaryValues[2][0], -30);
 const daysSpec={kind:'ar',report:true,name:'วันรับจริง',cols:[{key:'c7',label:'จำนวนวันรับจริง',type:'number',unit:'days'},{key:'amount',label:'ยอดเงิน',type:'number'}],rows:[{c7:96,amount:95.79}]};
 const daysBook=context.XLSX.read(await context.ioWorkbookBytes(daysSpec),{type:'array',cellNF:true});
 assert.equal(daysBook.Sheets['วันรับจริง'].A2.v,96);
 assert.equal(daysBook.Sheets['วันรับจริง'].A2.z,'0');
 assert.equal(daysBook.Sheets['วันรับจริง'].B2.z,'#,##0.00');
});
