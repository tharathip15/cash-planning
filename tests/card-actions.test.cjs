const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function card(label = 'ยอดรวม') {
  return { classList: { add() {} }, setAttribute() {}, querySelector: () => ({ textContent: label, setAttribute() {} }) };
}
function setup(extra = {}) {
  const context = vm.createContext({
    console, esc: String, money: String, shortDate: String, rangeLabel: () => 'ช่วงทดสอบ',
    eligible: row => row.type === 'in' && row.certainty !== 'uncertain',
    sum: (rows, type) => rows.filter(row => row.type === type).reduce((n, row) => n + row.amount, 0),
    periods: { am: 'เช้า', pm: 'บ่าย' }, ...extra,
  });
  vm.runInContext(fs.readFileSync('public/card-actions.js', 'utf8'), context);
  return context;
}

test('card activates by mouse, Enter and Space; ignores nested controls', () => {
  const context = setup();
  const element = card();
  let calls = 0;
  context.bindCard(element, () => calls++);
  element.onclick({ target: { closest: () => null } });
  element.onclick({ target: { closest: () => ({}) } });
  for (const key of ['Enter', ' ', 'Escape']) {
    element.onkeydown({ target: element, key, preventDefault() {} });
  }
  element.onkeydown({ target: {}, key: 'Enter' });
  assert.equal(calls, 3);
  assert.equal(element.tabIndex, 0);
});

test('overview cards preserve search results, certainty and period scope', () => {
  const rows = [
    { type: 'in', certainty: 'confirmed', period: 'am', amount: 100 },
    { type: 'in', certainty: 'uncertain', period: 'pm', amount: 50 },
    { type: 'out', period: 'pm', amount: 20 },
  ];
  const cards = Array.from({ length: 4 }, () => card());
  const periods = [card(), card()];
  let focused = false;
  const context = setup({ view: 'overview', dashboardRows: () => rows,
    document: {
      querySelectorAll: selector => selector.includes('.cards >') ? cards : selector.includes('.period-card') ? periods : [],
      querySelector: () => ({ focus() { focused = true; } }),
    },
  });
  const received = [];
  context.showCashCard = (title, selected) => received.push(selected);
  context.bindWorkspaceCards();
  cards[0].onclick();
  assert.equal(focused, true);
  for (const element of [cards[1], cards[2], ...periods]) {
    element.onclick({ target: { closest: () => null } });
  }
  assert.deepEqual(received, [[rows[0]], [rows[2]], [rows[0]], [rows[1], rows[2]]]);
});

test('report drilldowns use filtered rows, including signed credit notes', () => {
  const cards = [card('รายการ'), card('ยอดขาย'), card('ยอดค้าง')];
  const rows = [[100, 0], [-20, 30], [0, 0]];
  const context = setup({ reportData: {}, reportKind: () => 'monthly', reportRows: () => rows,
    reportTotalKeys: () => ['sales', 'debt'], reportValue: (row, key) => row[key === 'sales' ? 0 : 1],
    reportColumns: () => [{ key: 'sales', label: 'ยอดขาย', type: 'number' }], reportFormat: String,
    document: { querySelectorAll: () => cards },
  });
  const descriptions = [];
  context.showCardDetail = (title, description) => descriptions.push(description);
  context.bindReportCards();
  cards.forEach(element => element.onclick({ target: { closest: () => null } }));
  assert.deepEqual(descriptions, [3, 2, 1].map(n => `ข้อมูลตามตัวกรองปัจจุบัน · ${n} รายการ`));
});

test('daily table includes dates and escapes record values in range details', () => {
  const source = fs.readFileSync('public/calendar-detail.js', 'utf8');
  const context = setup({ groupName: () => 'รับเงิน', amount: row => row.amount, finalized: () => false,
    certainties: { confirmed: 'รับชัวร์' }, payStatuses: {}, esc: value => String(value).replaceAll('<', '&lt;'),
  });
  vm.runInContext(source.slice(source.indexOf('function calendarDetailTable'), source.indexOf('function openCalendarDay')), context);
  const html = context.calendarDetailTable([{ date: '2026-11-02', type: 'in', amount: 100, certainty: 'confirmed', party: '<script>', period: 'am' }], 'in', true);
  assert.match(html, /<th>วันที่<\/th>/);
  assert.match(html, /<td>2026-11-02<\/td>/);
  assert.match(html, /&lt;script>/);
  assert.doesNotMatch(context.calendarDetailTable([], 'out', true), /undefined/);
});

test('balance timeline excludes rows outside the current search and carries balance forward', () => {
  const source = fs.readFileSync('public/app.js', 'utf8');
  const rows = [
    { date: '2026-11-01', type: 'in', certainty: 'confirmed', period: 'am', amount: 100 },
    { date: '2026-11-02', type: 'out', period: 'pm', amount: 30 },
  ];
  const context = setup({
    rangeDates: () => ['2026-11-01', '2026-11-02'],
    dayRows: () => { throw Error('Must use filtered source rows'); },
    mainIncome: selected => selected.filter(row => row.type === 'in' && row.certainty !== 'uncertain').reduce((n, row) => n + row.amount, 0),
  });
  vm.runInContext(source.slice(source.indexOf('function rangeCashTable'), source.indexOf('function rangeCalendar')), context);
  const html = context.rangeCashTable(10, rows);
  assert.match(html, /<b>110<\/b>/);
  assert.match(html, /<b>80<\/b>/);
  assert.match(context.rangeCashTable(null, rows), /<b>—<\/b>/);
});

test('summary drilldowns match each income/payment category, period and certainty', () => {
  const context = setup();
  const rows = [
    { type: 'in', category: 'cash', period: 'am', certainty: 'confirmed', amount: 100 },
    { type: 'in', category: 'cash', period: 'am', certainty: 'uncertain', amount: 50 },
    { type: 'in', category: 'credit', period: 'pm', certainty: 'received', amount: 75 },
    { type: 'out', category: 'cash', period: 'unset', payStatus: 'uncertain', amount: 20 },
    { type: 'out', category: 'cash', period: 'am', payStatus: 'paid', amount: 30 },
    { type: 'out', category: 'unset', period: 'pm', payStatus: 'uncertain', amount: 10 },
  ];
  const selected = options => Array.from(context.cashSummaryRows(rows, options));
  assert.deepEqual(selected({ type: 'in', category: 'cash', period: 'am', scope: 'main' }), [rows[0]]);
  assert.deepEqual(selected({ type: 'in', category: 'cash', scope: 'uncertain' }), [rows[1]]);
  assert.deepEqual(selected({ type: 'in', category: 'cash', scope: 'all' }), rows.slice(0, 2));
  assert.deepEqual(selected({ type: 'out', category: 'cash', scope: 'main' }), rows.slice(3, 5));
  assert.deepEqual(selected({ type: 'out', category: 'cash', period: 'unset', scope: 'main' }), [rows[3]]);
  assert.deepEqual(selected({ type: 'out', category: 'cash', scope: 'uncertain' }), [rows[3]]);
  assert.deepEqual(selected({ category: 'unset', scope: 'all' }), [rows[5]]);
  assert.deepEqual(selected({ scope: 'all' }), rows);
  assert.deepEqual(selected({ type: 'out', category: 'credit', scope: 'main' }), []);
});

test('summary button opens only rows passed by the dashboard search', () => {
  const row = { type: 'out', category: 'cash', period: 'unset', payStatus: 'uncertain', amount: 20 };
  const button = { dataset: { summaryType: 'out', summaryCategory: 'cash', summaryPeriod: 'unset', summaryScope: 'main' },
    getAttribute: () => 'จ่ายเงินสด · ยังไม่ระบุ · ดูรายละเอียด' };
  const context = setup({ document: { querySelectorAll: () => [button] } });
  let actual;
  context.showCashCard = (title, rows) => { actual = { title, rows: Array.from(rows) }; };
  context.bindCashSummary([row]);
  button.onclick();
  assert.equal(actual.title, 'จ่ายเงินสด · ยังไม่ระบุ');
  assert.deepEqual(actual.rows, [row]);
});
