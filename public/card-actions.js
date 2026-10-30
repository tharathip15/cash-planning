/* Read-only drilldowns use the same rows and filters as their summary cards. */
function bindCard(card, action, hint = 'คลิกดูรายละเอียด') {
  if (!card) return;
  card.classList.add('clickable-card');
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  const label = card.querySelector('label,h2,small')?.textContent || 'รายละเอียด';
  card.setAttribute('aria-label', label + ' · ' + hint);
  card.title = hint;
  card.onclick = event => {
    if (event.target.closest('input,select,button,a')) return;
    action();
  };
  card.onkeydown = event => {
    if (event.target !== card || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    action();
  };
}

function showCardDetail(title, description, html, exportSpec = null) {
  let modal = document.querySelector('#card-detail');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'card-detail';
    modal.setAttribute('aria-labelledby', 'card-detail-title');
    document.body.append(modal);
  }
  modal.innerHTML = `<div class="day-detail-top"><div><div class="eyebrow">รายละเอียดจากการ์ด</div><h2 id="card-detail-title">${esc(title)}</h2></div><div class="detail-actions">${exportSpec?'<button type="button" class="secondary" data-card-export>ส่งออก Excel</button>':''}<button type="button" class="secondary" data-card-close autofocus>ปิด ✕</button></div></div><div class="card-detail-body"><p>${esc(description)}</p>${html}</div>`;
  if (exportSpec) modal.querySelector('[data-card-export]').onclick = event => exportStyledExcel(false, exportSpec, event.currentTarget);
  modal.querySelector('[data-card-close]').onclick = () => modal.close();
  if (!modal.open) modal.showModal();
}

function showCashCard(title, rows, scope = rangeLabel()) {
  const incoming = rows.filter(x => x.type === 'in');
  const outgoing = rows.filter(x => x.type === 'out');
  showCardDetail(title, scope,
    `<div class="range-strip">รับรวม ${money(sum(incoming, 'in'))} บาท · จ่ายรวม ${money(sum(outgoing, 'out'))} บาท · ${rows.length} รายการ</div>` +
    calendarDetailTable(incoming, 'in', true) + calendarDetailTable(outgoing, 'out', true),
    ioCashRecordSpec(rows, title, incoming.length && !outgoing.length ? 'in' : outgoing.length && !incoming.length ? 'out' : 'all'));
}

function cashSummaryRows(rows, selection) {
  return rows.filter(row =>
    (!selection.type || row.type === selection.type) &&
    (!selection.category || row.category === selection.category) &&
    (!selection.period || selection.period === 'all' || row.period === selection.period) &&
    (selection.scope === 'uncertain'
      ? (row.type === 'in' ? row.certainty === 'uncertain' : row.payStatus === 'uncertain')
      : selection.scope === 'main' ? row.type === 'out' || eligible(row) : true));
}

function cashSummaryButton(label, type, category, period, scope, title) {
  return `<button type="button" class="summary-value" data-summary-type="${type}" data-summary-category="${category}" data-summary-period="${period}" data-summary-scope="${scope}" aria-label="${esc(title)} · ดูรายละเอียด">${label}</button>`;
}

function bindCashSummary(rows) {
  document.querySelectorAll('#cash-summary [data-summary-scope]').forEach(button => {
    button.onclick = () => showCashCard(button.getAttribute('aria-label').replace(' · ดูรายละเอียด', ''), cashSummaryRows(rows, {
      type: button.dataset.summaryType, category: button.dataset.summaryCategory,
      period: button.dataset.summaryPeriod, scope: button.dataset.summaryScope,
    }));
  });
}

function bindWorkspaceCards() {
  if (view !== 'overview') return;
  const rows = dashboardRows();
  bindCashSummary(rows);
  const cards = document.querySelectorAll('#content .cards > .card');
  // The opening balance remains a native, labelled input; clicking its card focuses it.
  if (cards[0]) {
    cards[0].classList.add('opening-card');
    cards[0].onclick = () => document.querySelector('#overview-opening')?.focus();
    cards[0].querySelector('label')?.setAttribute('for', 'overview-opening');
  }
  bindCard(cards[1], () => showCashCard('เงินรับในแผนหลัก', rows.filter(eligible)));
  bindCard(cards[2], () => showCashCard('ยอดจ่ายรวมแผนและจ่ายแล้ว', rows.filter(x => x.type === 'out')));
  bindCard(cards[3], () => showCardDetail('เงินปลายช่วงตามแผนหลัก', rangeLabel(),
    `<div class="range-strip">เงินต้นช่วง ${opening === '' ? 'ยังไม่ระบุ' : money(Number(opening)) + ' บาท'} + เงินรับในแผนหลัก ${money(mainIncome(rows))} − ยอดจ่าย ${money(sum(rows, 'out'))} บาท</div>` + rangeCashTable(opening === '' ? null : Number(opening), rows), ioOverviewExportSpec(rows, opening)));
  document.querySelectorAll('#content .period-card').forEach((card, index) => {
    const period = index === 0 ? 'am' : 'pm';
    bindCard(card, () => showCashCard('รายการช่วง' + periods[period], rows.filter(x => x.period === period)));
  });
}

function bindDayCards() {
  const rows = calendarRows(calendarDetailDate);
  document.querySelectorAll('#day-detail-content .day-detail-card').forEach((card, index) => {
    const selected = rows.filter(x => index === 0 ? eligible(x) : index === 1 ? x.type === 'out' : eligible(x) || x.type === 'out');
    bindCard(card, () => showCashCard(card.querySelector('label').textContent, selected, shortDate(calendarDetailDate)));
  });
}

function bindReportCards() {
  if (!reportData) return;
  const monthly = reportKind() === 'monthly';
  const rows = reportRows();
  document.querySelectorAll('#content .report-metrics > div').forEach((card, index) => {
    bindCard(card, () => {
      const selected = rows.filter(row => index === 0 || (monthly
        ? Number(reportValue(row, reportTotalKeys()[index - 1])) !== 0
        : index === 1 ? Number(reportValue(row, 'c7')) !== 0 : String(row[10]).includes('ไม่พบ')));
      const columns = reportColumns();
      const head = columns.map(col => `<th>${esc(col.label)}</th>`).join('');
      const body = selected.map(row => '<tr>' + columns.map(col =>
        `<td class="${col.type === 'number' ? 'money' : ''}">${reportFormat(reportValue(row, col.key), col)}</td>`).join('') + '</tr>').join('');
      showCardDetail(card.querySelector('small').textContent, `ข้อมูลตามตัวกรองปัจจุบัน · ${selected.length} รายการ`,
        `<div class="report-table-wrap"><table class="report-table"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" class="empty">ไม่มีรายการ</td></tr>`}</tbody></table></div>`,
        {kind:'ar',report:true,name:card.querySelector('small').textContent,cols:columns,rows:selected.map(row=>Object.fromEntries(columns.map(col=>[col.key,reportValue(row,col.key)])))});
    });
  });
}
