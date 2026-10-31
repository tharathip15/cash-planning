/* Cash supplier envelopes and calendar totals share the same effective amounts. */
function calendarExpenseBreakdown(rows){
 const totals={inventory:0,expense:0,unset:0};
 for(const row of rows){if(row.type!=='out')continue;const key=['inventory','expense'].includes(row.expenseType)?row.expenseType:'unset';totals[key]+=amount(row)}
 return totals;
}
function calendarExpenseBreakdownHTML(rows){
 const totals=calendarExpenseBreakdown(rows);
 return `<div class="calendar-expense-breakdown" aria-label="แยกยอดจ่ายตามประเภท"><small><span>ต้นทุนขาย</span><strong>${money(totals.inventory)}</strong></small><small><span>ค่าใช้จ่าย</span><strong>${money(totals.expense)}</strong></small>${totals.unset?`<small class="unclassified"><span>ยังไม่ระบุประเภท</span><strong>${money(totals.unset)}</strong></small>`:''}</div>`;
}
function isCashBudget(row){return row.type==='out'&&row.category==='cash'&&(row.cashBudget===true||Number(row.id)<=100000&&String(row.name).trim()==='ซัพเงินสด')}
function cashBudgetDemand(row,source){
 let prior=0;
 for(const item of source){
  if(item.date!==row.date||item.type!=='out'||item.category!=='cash')continue;
  if(!isCashBudget(item))continue;
  if(String(item.id)===String(row.id))break;
  if(item.payStatus!=='paid')prior+=recordAmount(item);
 }
 // Expenses can appear after their envelope in the table.
 const spent=source.filter(x=>x.date===row.date&&x.type==='out'&&x.category==='cash'&&!isCashBudget(x)).reduce((n,x)=>n+recordAmount(x),0);
 return Math.max(0,spent-prior);
}
function cashBudgetAmount(row,source){return isCashBudget(row)&&row.payStatus!=='paid'?Math.max(0,recordAmount(row)-cashBudgetDemand(row,source)):recordAmount(row)}
function cashBudgetHint(row){if(!isCashBudget(row)||row.payStatus==='paid')return '';return `<small class="cash-budget-hint" data-budget-hint="${row.id}">งบตั้งต้น ${money(row.amount)} · ใช้แล้ว ${money(Math.min(row.amount,cashBudgetDemand(row,data)))}</small>`}
function refreshCashBudgetCells(){
 document.querySelectorAll('[data-budget-hint]').forEach(hint=>{
  const row=data.find(x=>String(x.id)===hint.dataset.budgetHint);if(!row)return;
  const input=document.querySelector(`[data-grid-id="${row.id}"][data-grid-key="amount"]`);
  if(input&&document.activeElement!==input)input.value=money(amount(row));
  hint.textContent=`งบตั้งต้น ${money(row.amount)} · ใช้แล้ว ${money(Math.min(row.amount,cashBudgetDemand(row,data)))}`;
 });
}
function overviewPendingIncome(rows){
 const pending=uncertainIncome(rows);if(!pending)return '';
 return `<div class="pending-income-notice"><span><b>เงินรับรอยืนยัน ${money(pending)} บาท</b><small>แสดงแยกจากเงินรับในแผนหลัก</small></span><button class="secondary" id="overview-pending">ดูรายการรอยืนยัน ↗</button></div>`;
}
function unknownPeriodSummary(rows){
 const selected=rows.filter(x=>x.period==='unset');if(!selected.length)return '';
 const income=mainIncome(selected),expense=sum(selected,'out');
 return `<section class="period-card"><h2>ยังไม่ระบุเวลา</h2><div class="flowrow green"><span>รับชัวร์ + รับแล้ว</span><b>${money(income)}</b></div><div class="flowrow red"><span>แผนจ่าย + จ่ายแล้ว</span><b>${money(expense)}</b></div><div class="flowrow muted"><span>เงินรับรอยืนยัน</span><span>${money(uncertainIncome(selected))}</span></div><div class="flowrow end"><span>รับ − จ่ายสุทธิ</span><span>${money(income-expense)}</span></div><div class="helper">ยังไม่ได้แยกเช้าหรือบ่าย</div></section>`;
}
function calendarMonthSummary(month,source){
 const rows=source.filter(x=>x.date.slice(0,7)===month&&x.date>=rangeStart&&x.date<=rangeEnd),start=month+'-01';
 const first=new Date(start+'T00:00:00Z'),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).toISOString().slice(0,10);
 const from=rangeStart>start?rangeStart:start,to=rangeEnd<last?rangeEnd:last,weeks=new Map();
 let date=from;
 while(date<=to){
  const day=new Date(date+'T00:00:00Z'),sunday=new Date(day);sunday.setUTCDate(day.getUTCDate()-day.getUTCDay());
  const key=sunday.toISOString().slice(0,10);if(!weeks.has(key))weeks.set(key,{start:date,end:date,rows:[]});
  const week=weeks.get(key);week.end=date;week.rows.push(...rows.filter(x=>x.date===date));
  day.setUTCDate(day.getUTCDate()+1);date=day.toISOString().slice(0,10);
 }
 const summarize=(label,group)=>({label,start:group.start,end:group.end,income:mainIncome(group.rows),expense:sum(group.rows,'out'),uncertain:uncertainIncome(group.rows),net:mainIncome(group.rows)-sum(group.rows,'out'),inventory:calendarExpenseBreakdown(group.rows).inventory,operatingExpense:calendarExpenseBreakdown(group.rows).expense});
 return {weeks:[...weeks.values()].map((week,i)=>summarize('สัปดาห์ '+(i+1),week)),month:summarize('รวมเดือน',{start:from,end:to,rows})};
}
function calendarSummaryHTML(month){
 const summary=calendarMonthSummary(month,dashboardRows());
 const cells=row=>['income','expense','inventory','operatingExpense','net','uncertain'].map(key=>`<td class="money ${['expense','inventory','operatingExpense'].includes(key)?'red':key==='uncertain'?'pending-total':key==='net'&&row.net<0?'red':'green'}"><button type="button" class="calendar-summary-value" data-calendar-summary-start="${row.start}" data-calendar-summary-end="${row.end}" data-calendar-summary-key="${key}" aria-label="${row.label} · ${key==='income'?'รับในแผนหลัก':key==='expense'?'จ่ายรวม':key==='inventory'?'ต้นทุนขาย':key==='operatingExpense'?'ค่าใช้จ่าย':key==='net'?'รับลบจ่าย':'รอรับยืนยัน'} · ดูรายละเอียด">${money(row[key])}</button></td>`).join('');
 return `<div class="calendar-summary"><div class="calendar-summary-heading"><h3>สรุปรายสัปดาห์และรายเดือน</h3><span>${shortDate(summary.month.start)} – ${shortDate(summary.month.end)}</span></div><div class="scroll"><table><thead><tr><th>ช่วงวันที่</th><th class="money">รับในแผนหลัก</th><th class="money">จ่ายรวม</th><th class="money">ต้นทุนขาย</th><th class="money">ค่าใช้จ่าย</th><th class="money">รับ − จ่าย</th><th class="money">รอรับยืนยัน</th></tr></thead><tbody>${summary.weeks.map(row=>`<tr><th scope="row"><b>${row.label}</b><small>${shortDate(row.start)} – ${shortDate(row.end)}</small></th>${cells(row)}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">รวมเดือน<small>เฉพาะช่วงวันที่เลือก</small></th>${cells(summary.month)}</tr></tfoot></table></div></div>`;
}
function bindCashCalendar(){
 const pending=document.querySelector('#overview-pending');if(pending)pending.onclick=()=>showCashCard('เงินรับรอยืนยัน',dashboardRows().filter(x=>x.type==='in'&&x.certainty==='uncertain'));
 document.querySelectorAll('[data-calendar-summary-start]').forEach(el=>el.onclick=()=>{
  const {calendarSummaryStart:start,calendarSummaryEnd:end,calendarSummaryKey:key}=el.dataset;
  const rows=dashboardRows().filter(x=>x.date>=start&&x.date<=end).filter(x=>key==='income'?eligible(x):key==='expense'?x.type==='out':key==='inventory'?x.type==='out'&&x.expenseType==='inventory':key==='operatingExpense'?x.type==='out'&&x.expenseType==='expense':key==='uncertain'?x.type==='in'&&x.certainty==='uncertain':eligible(x)||x.type==='out');
  showCashCard(el.getAttribute('aria-label').replace(' · ดูรายละเอียด',''),rows,shortDate(start)+' – '+shortDate(end));
 });
}
