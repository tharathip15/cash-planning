/* Calendars share the same filtered bills and live balances as their tables. */
const customerCalendarState={ar:{mode:'table',month:'',basis:'promiseDate'},report:{mode:'table',month:''}};
const calendarRanges={ar:null,report:null,tasks:null};
function calendarRangeDates(month){const d=new Date(month+'-01T00:00:00Z');return {start:month+'-01',end:new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).toISOString().slice(0,10)}}
function calendarRangeRows(kind,rows){const r=calendarRanges[kind];return r?rows.filter(x=>customerCalendarDate(x.date)&&x.date>=r.start&&x.date<=r.end):rows}
function calendarRangeToolbar(kind,month){
 const r=calendarRanges[kind]||calendarRangeDates(month),selected=r.start.slice(0,7),names=['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
 return `<section class="calendar-range-toolbar" aria-label="ช่วงวันที่ปฏิทิน"><label>เดือน<select data-range-month>${names.map((name,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${Number(selected.slice(5))===i+1?'selected':''}>${name}</option>`).join('')}</select></label><label>ปี พ.ศ.<input data-range-year type="number" min="2443" max="2643" value="${Number(selected.slice(0,4))+543}"></label><label>เริ่มวันที่<input data-range-start type="date" value="${r.start}"></label><label>ถึงวันที่<input data-range-end type="date" value="${r.end}"></label><button type="button" class="secondary" data-range-apply>ใช้ช่วงวันที่</button><button type="button" class="secondary" data-range-export>ส่งออก Excel · ปฏิทิน</button><span data-range-error role="alert"></span></section>`;
}
function calendarApplyRange(kind,start,end){
 if(!customerCalendarDate(start)||!customerCalendarDate(end)||start>end)return false;
 if(kind==='report'&&typeof reportData!=='undefined'&&reportData?.monthly?.months){
  const keys=reportData.monthly.months.filter(m=>{const month=customerReportCalendarMonth(m.key);return month>=start.slice(0,7)&&month<=end.slice(0,7)});if(!keys.length)return false;
  reportState.monthly.from=keys[0].key;reportState.monthly.to=keys.at(-1).key;
 }
 calendarRanges[kind]={start,end};if(kind==='tasks')arTaskCalendarState.month=start.slice(0,7);else customerCalendarState[kind].month=start.slice(0,7);return true;
}
function bindCalendarRange(kind,refresh,exportSpec){
 const root=document.querySelector?.('.calendar-range-toolbar');if(!root)return;
 const find=selector=>root.querySelector(selector),apply=()=>{if(!calendarApplyRange(kind,find('[data-range-start]').value,find('[data-range-end]').value)){find('[data-range-error]').textContent='เลือกช่วงวันที่ให้ถูกต้อง และตรงกับปีที่มีข้อมูลรายงาน';return}refresh()};
 const monthChanged=()=>{const year=Number(find('[data-range-year]').value);if(!Number.isInteger(year)||year<2443||year>2643)return;const range=calendarRangeDates((year-543)+'-'+find('[data-range-month]').value);find('[data-range-start]').value=range.start;find('[data-range-end]').value=range.end;apply()};
 find('[data-range-month]').onchange=monthChanged;find('[data-range-year]').onchange=monthChanged;find('[data-range-apply]').onclick=apply;find('[data-range-export]').onclick=e=>exportStyledExcel(false,exportSpec(),e.currentTarget);
}
function customerCalendarDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!isNaN(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value}
function customerReportCalendarMonth(key){return String(Number(String(key).slice(0,4))-543)+'-'+String(key).slice(4,6)}
function customerCalendarMonthChoices(kind){return kind==='report'&&typeof reportData!=='undefined'&&reportData?.monthly?.months?reportSelectedMonths().map(m=>customerReportCalendarMonth(m.key)):null}
function customerCalendarSetMonth(kind,month){
 if(!customerCalendarDate(month+'-01'))return false;
 const choices=customerCalendarMonthChoices(kind);if(choices&&!choices.includes(month))return false;
 customerCalendarState[kind].month=month;return true;
}
function calendarYearHTML(month){return `<label class="calendar-year-filter">ปี พ.ศ. <input id="calendar-year" type="number" min="2443" max="2643" step="1" value="${Number(month.slice(0,4))+543}" aria-label="ปี พ.ศ. ของปฏิทิน"></label><span id="calendar-year-message" class="calendar-year-message" role="status"></span>`}
function calendarMonthInYear(month,year,choices=null){
 const n=Number(year);if(!Number.isInteger(n)||n<2443||n>2643)return '';
 const next=String(n-543)+'-'+month.slice(5,7);if(!choices)return next;
 return choices.includes(next)?next:choices.find(value=>value.slice(0,4)===String(n-543))||'';
}
function bindCalendarYear(month,choices,change){
 const input=$('#calendar-year');if(!input)return;
 input.onchange=()=>{const next=calendarMonthInYear(month,input.value,choices),message=$('#calendar-year-message');if(!next){message.textContent=choices?'ปีนี้ไม่มีข้อมูลในช่วงตัวกรองรายงาน กรุณาเลือกปีและช่วงเดือนที่มีข้อมูล':'กรอกปี พ.ศ. ระหว่าง 2443–2643';input.value=Number(month.slice(0,4))+543;return}message.textContent='';change(next)};
}
function customerCalendarGroups(records){
 const groups=new Map();
 for(const r of records){const company=reportCompanyCode(r.company),key=JSON.stringify([company,String(r.code||'').trim().toUpperCase()||r.name]);let group=groups.get(key);if(!group){group={company,code:r.code||'',name:r.name||'',sales:0,outstanding:0,bills:new Set(),customerTypes:new Set(),behaviorLabels:new Set()};groups.set(key,group)}group.sales+=Number(r.sales)||0;group.outstanding+=Number(r.outstanding)||0;group.bills.add(r.bill||r.id);if(r.customerType)group.customerTypes.add(r.customerType);if(r.behaviorLabel)group.behaviorLabels.add(r.behaviorLabel)}
 return [...groups.values()].map(r=>({...r,bills:r.bills.size,customerType:[...r.customerTypes].join(' / '),behaviorLabel:[...r.behaviorLabels].join(' / ')})).sort((a,b)=>a.company.localeCompare(b.company)||a.name.localeCompare(b.name,'th'));
}
function customerCalendarProfiles(rows){
 const snapshot=typeof reportData==='undefined'?null:reportData,key=(company,code)=>JSON.stringify([reportCompanyCode(company),String(code||'').trim().toUpperCase()]),types=new Map();
 for(const r of snapshot?.monthly?.rows||[])if(r[5])types.set(key(r[1],r[2]),r[5]);
 for(const r of snapshot?.credit?.rows||[])if(r[4])types.set(key(r[1],r[2]),r[4]);
 return rows.map(r=>{const behavior=typeof customerBehavior==='function'?customerBehavior(r,'ar'):r,edit=typeof rrKey==='function'?snapshot?.customerEdits?.[rrKey(r.sourceCompany,r.sourceCustomerCode)]:null;return {...r,customerType:edit?.type??types.get(key(r.sourceCompany,r.sourceCustomerCode))??r.customerType??'ยังไม่ระบุประเภท',behaviorLabel:(typeof paymentBehaviors!=='undefined'?paymentBehaviors[behavior.paymentBehavior||'']:null)||'ยังไม่มีข้อมูล'}});
}
function customerCalendarRecords(kind,rows){
 if(kind==='ar')return calendarRangeRows('ar',customerCalendarProfiles(rows).map(r=>({id:r.id,company:r.sourceCompany,code:r.sourceCustomerCode,name:r.customer,bill:r.billNo,date:r[customerCalendarState.ar.basis]||'',outstanding:arOutstanding(r),customerType:r.customerType,behaviorLabel:r.behaviorLabel})));
 const keys=reportTotalKeys(),sales=reportSourceDetail(rows,keys[0],'monthly'),debt=reportSourceDetail(rows,keys[1],'monthly');
 if(!sales||!debt)return null;
 return calendarRangeRows('report',[...sales.rows.map(r=>({...r,sales:r.amount,outstanding:0})),...debt.rows.map(r=>({...r,sales:0,outstanding:r.amount}))]);
}
function customerCalendarSwitch(kind){const s=customerCalendarState[kind];return `<div class="customer-calendar-switch" role="group" aria-label="รูปแบบการแสดงผล">${[['table','ตาราง'],['calendar','ปฏิทิน']].map(([key,label])=>`<button type="button" class="secondary" data-customer-mode="${kind}:${key}" aria-pressed="${s.mode===key}">${label}</button>`).join('')}</div>`}
function customerCalendarBehaviorSummary(groups){
 return Object.fromEntries(['PF','TNP','NV'].map(company=>{
  const segments=new Map();
  for(const r of groups.filter(r=>r.company===company&&r.outstanding!==0)){const label=r.behaviorLabel||'ยังไม่มีข้อมูล';if(!segments.has(label))segments.set(label,{label,outstanding:0,customers:0});const segment=segments.get(label);segment.outstanding+=r.outstanding;if(r.outstanding>0)segment.customers++}
  return [company,[...segments.values()]];
 }));
}
function customerCalendarSummary(month,records,range=null){
 const first=new Date(month+'-01T00:00:00Z'),last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).toISOString().slice(0,10);
 const summarize=(start,end,label)=>{
  const groups=customerCalendarGroups(records.filter(r=>customerCalendarDate(r.date)&&r.date>=start&&r.date<=end));
  return {start,end,label,behaviors:customerCalendarBehaviorSummary(groups),sales:groups.reduce((n,r)=>n+r.sales,0),outstanding:groups.reduce((n,r)=>n+r.outstanding,0),customers:groups.filter(r=>r.outstanding>0).length,...Object.fromEntries(['PF','TNP','NV'].map(company=>[company,groups.filter(r=>r.company===company).reduce((n,r)=>n+r.outstanding,0)]))};
 };
 const from=range&&range.start>month+'-01'?range.start:month+'-01',to=range&&range.end<last?range.end:last;
 const weeks=[];let start=from;
 while(start<=to){const endDate=new Date(start+'T00:00:00Z');endDate.setUTCDate(endDate.getUTCDate()+6-endDate.getUTCDay());const end=endDate.toISOString().slice(0,10)>to?to:endDate.toISOString().slice(0,10);weeks.push(summarize(start,end,'สัปดาห์ '+(weeks.length+1)));const next=new Date(end+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);start=next.toISOString().slice(0,10)}
 return {weeks,month:summarize(from,to,'รวมเดือน')};
}
function customerCalendarIsPromise(kind){return kind==='ar'&&customerCalendarState.ar.basis==='promiseDate'}
function customerCalendarAmountLabel(kind){return customerCalendarIsPromise(kind)?'ยอดนัดรับ':'ยอดค้าง'}
function customerCalendarSummaryHTML(kind,month,records){
 const label=customerCalendarAmountLabel(kind),summary=customerCalendarSummary(month,records,calendarRanges[kind]),columns=[...(kind==='report'?[['sales','ยอดขาย']]:[]),['PF','PF · '+label],['TNP','TNP · '+label],['NV','NV · '+label],['outstanding',label+'รวม'],['customers',customerCalendarIsPromise(kind)?'ลูกค้านัดรับ (ราย)':'ลูกหนี้ค้าง (ราย)']];
 const cells=row=>columns.map(([key,label])=>{
  const breakdown=customerCalendarIsPromise(kind)&&row.behaviors[key]?`<div class="calendar-summary-behaviors" aria-label="${row.label} · ${key} · พฤติกรรมการจ่าย">${row.behaviors[key].map(segment=>`<button type="button" class="calendar-summary-behavior" data-customer-summary-start="${row.start}" data-customer-summary-end="${row.end}" data-customer-summary-key="${key}" data-customer-summary-behavior="${esc(segment.label)}" aria-label="${esc(row.label+' · '+key+' · '+segment.label)} · ดูรายละเอียด"><span>${esc(segment.label)}</span><strong>${money(segment.outstanding)} บาท · ${segment.customers.toLocaleString('th-TH')} ราย</strong></button>`).join('')||'<small class="calendar-summary-empty">ไม่มีนัดรับเงิน</small>'}</div>`:'';
  return `<td class="money ${key==='sales'?'green':key==='customers'?'':'red'}"><button type="button" class="calendar-summary-value" data-customer-summary-start="${row.start}" data-customer-summary-end="${row.end}" data-customer-summary-key="${key}" aria-label="${row.label} · ${label} · ดูรายละเอียด">${key==='customers'?row[key].toLocaleString('th-TH'):money(row[key])}</button>${breakdown}</td>`;
 }).join('');
 return `<div class="calendar-summary"><div class="calendar-summary-heading"><h3>สรุปรายสัปดาห์และรายเดือน</h3><span>${arDate(summary.month.start)} – ${arDate(summary.month.end)}</span></div><div class="scroll"><table><thead><tr><th>ช่วงวันที่</th>${columns.map(([,label])=>`<th class="money">${label}</th>`).join('')}</tr></thead><tbody>${summary.weeks.map(row=>`<tr><th scope="row">${row.label}<small>${arDate(row.start)} – ${arDate(row.end)}</small></th>${cells(row)}</tr>`).join('')}</tbody><tfoot><tr><th scope="row">รวมเดือน<small>ตามตัวกรองปัจจุบัน</small></th>${cells(summary.month)}</tr></tfoot></table></div><p class="helper">ยอดเงินเป็นบาท · จำนวนลูกค้านับไม่ซ้ำแยกตามบริษัทในแต่ละช่วง · ${label}รวมเครดิตโน้ตตามข้อมูลปัจจุบัน · รายการไม่มีวันที่แสดงแยก ไม่รวมในสัปดาห์หรือเดือน · คลิกยอดเพื่อดูรายลูกค้า</p></div>`;
}
function customerReportCalendarDayHTML(records,includeSales=true){
 const companies=['PF','TNP','NV'],groups=customerCalendarGroups(records).filter(r=>companies.includes(r.company));
 const sum=(rows,key)=>rows.reduce((n,r)=>n+r[key],0);
 const amountRow=(label,value,tone)=>`<small class="calendar-amount ${tone}"><span>${label}</span><strong>${money(value)} <span class="calendar-unit">บาท</span></strong></small>`;
 return (includeSales?amountRow('ยอดขาย',sum(groups,'sales'),'green'):'')+'<div class="calendar-debt-box" aria-label="ยอดค้างแยกบริษัท">'+amountRow('ยอดค้างรวม',sum(groups,'outstanding'),'red')+companies.map(company=>{const rows=groups.filter(r=>r.company===company),debt=sum(rows,'outstanding'),count=rows.filter(r=>r.outstanding>0).length;return `<small class="customer-calendar-company calendar-debt-row ${debt===0?'is-zero':''}"><span class="calendar-company">${company}</span><strong class="calendar-company-amount">${money(debt)} <span class="calendar-unit">บาท</span></strong><span class="calendar-company-count">${count.toLocaleString('th-TH')} ราย</span></small>`}).join('')+'</div>';
}
function customerPromiseCalendarDayHTML(records){
 const companies=['PF','TNP','NV'],groups=customerCalendarGroups(records).filter(r=>companies.includes(r.company)&&r.outstanding!==0),sum=rows=>rows.reduce((n,r)=>n+r.outstanding,0);
 const header=`<small class="calendar-amount green"><span>ยอดนัดรับรวม</span><strong>${money(sum(groups))} <span class="calendar-unit">บาท</span></strong></small>`;
 const companyHTML=companies.map(company=>{
  const rows=groups.filter(r=>r.company===company),segments=new Map();
  for(const r of rows){const behavior=r.behaviorLabel||'ยังไม่มีข้อมูล';if(!segments.has(behavior))segments.set(behavior,{behavior,outstanding:0,customers:0,types:new Set()});const segment=segments.get(behavior);segment.outstanding+=r.outstanding;if(r.outstanding>0)segment.customers++;segment.types.add(r.customerType||'ยังไม่ระบุประเภท')}
  return `<div class="calendar-promise-company" data-promise-company="${company}"><small class="customer-calendar-company calendar-debt-row"><span class="calendar-company">${company}</span><strong class="calendar-company-amount">${money(sum(rows))} <span class="calendar-unit">บาท</span></strong><span class="calendar-company-count">${rows.filter(r=>r.outstanding>0).length.toLocaleString('th-TH')} ราย</span></small>${[...segments.values()].map(r=>`<small class="calendar-promise-segment"><span>${esc(r.behavior)}</span><strong>${money(r.outstanding)} บาท · ${r.customers.toLocaleString('th-TH')} ราย</strong><span class="calendar-promise-types">ประเภท: ${esc([...r.types].join(' / '))}</span></small>`).join('')}</div>`;
 }).join('');
 return '<div class="calendar-promise-breakdown">'+header+companyHTML+(!groups.length?'<small class="calendar-promise-empty">ไม่มีนัดรับเงิน</small>':'')+'</div>';
}

function calendarRangeMonths(range){const months=[];let month=range.start.slice(0,7);while(month<=range.end.slice(0,7)){months.push(month);const d=new Date(month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);month=d.toISOString().slice(0,7)}return months}
function customerCalendarHTML(kind,records){
 if(records===null)return customerCalendarMonthHTML(kind,records);
 const s=customerCalendarState[kind],range=calendarRanges[kind];
 if(!s.month)s.month=kind==='ar'?arAsOf.slice(0,7):customerCalendarMonthChoices(kind)?.[0]||records.find(r=>customerCalendarDate(r.date))?.date.slice(0,7)||bangkokToday().slice(0,7);
 const choices=customerCalendarMonthChoices(kind);if(!range&&choices?.length&&!choices.includes(s.month))s.month=choices[0];

 if(!range)return customerCalendarMonthHTML(kind,records);
 const filtered=calendarRangeRows(kind,records),html=calendarRangeMonths(range).map(month=>{s.month=month;return customerCalendarMonthHTML(kind,filtered,month!==range.start.slice(0,7))}).join('');s.month=range.start.slice(0,7);return html;
}
function customerCalendarRangeExport(kind,rows){
 const source=customerCalendarRecords(kind,rows)||[],range=calendarRanges[kind]||calendarRangeDates(customerCalendarState[kind].month),records=source.filter(r=>customerCalendarDate(r.date)&&r.date>=range.start&&r.date<=range.end);
 const cols=[{key:'date',label:'วันที่',type:'date'},{key:'company',label:'บริษัท'},{key:'code',label:'รหัสลูกค้า'},{key:'name',label:'ลูกค้า'},{key:'bill',label:'เลขบิล'},...(kind==='report'?[{key:'sales',label:'ยอดขาย',type:'number'}]:[{key:'customerType',label:'ประเภทลูกค้า'},{key:'behaviorLabel',label:'พฤติกรรมการจ่าย'}]),{key:'outstanding',label:customerCalendarAmountLabel(kind),type:'number'}];return {kind:'ar',report:true,name:'ปฏิทิน-'+range.start+'-'+range.end,cols,rows:records};
}
function customerCalendarMonthHTML(kind,records,secondary=false){
 const s=customerCalendarState[kind];
 if(records===null)return '<div class="notice">ยังไม่มีข้อมูลบิลรายวันสำหรับปฏิทิน กรุณานำเข้ารายงานต้นทาง · ดูยอดสรุปได้ในมุมมองตาราง</div>';
 const choices=customerCalendarMonthChoices(kind);
 if(choices&&!choices.length)return '<div class="notice">ไม่พบเดือนในช่วงตัวกรองรายงาน กรุณาเลือกช่วงเดือนใหม่</div>';
 if(choices&&!choices.includes(s.month)&&!calendarRanges[kind])s.month=choices[0];
 if(!s.month){const first=records.find(r=>customerCalendarDate(r.date));s.month=kind==='ar'?arAsOf.slice(0,7):first?.date.slice(0,7)||bangkokToday().slice(0,7)}
 const first=new Date(s.month+'-01T00:00:00Z'),days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(),byDate=new Map();
 for(const r of records){const key=customerCalendarDate(r.date)?r.date:'unset';if(!byDate.has(key))byDate.set(key,[]);byDate.get(key).push(r)}
 const shown=records.filter(r=>customerCalendarDate(r.date)&&r.date.slice(0,7)===s.month),total=customerCalendarGroups(shown),sum=key=>total.reduce((n,r)=>n+r[key],0),unknown=byDate.get('unset')||[];
 const monthLabel=new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
 let cells='<div class="day" aria-hidden="true"></div>'.repeat(first.getUTCDay());
 for(let day=1;day<=days;day++){
  const date=s.month+'-'+String(day).padStart(2,'0'),groups=customerCalendarGroups(byDate.get(date)||[]).filter(r=>r.outstanding>0);
  const balance=(byDate.get(date)||[]).reduce((n,r)=>n+(Number(r.outstanding)||0),0);
  cells+=`<button type="button" class="day ${groups.length?'has-debt':'no-debt'} ${calendarRanges[kind]&&(date<calendarRanges[kind].start||date>calendarRanges[kind].end)?'outside-range':''}" ${calendarRanges[kind]&&(date<calendarRanges[kind].start||date>calendarRanges[kind].end)?'disabled':''} data-customer-day="${date}" aria-label="${esc(arDate(date))} · ${customerCalendarAmountLabel(kind)} ${money(balance)} บาท · ${groups.length} ราย · ดูรายละเอียด"><b>${day}</b>${customerCalendarIsPromise(kind)?customerPromiseCalendarDayHTML(byDate.get(date)||[]):customerReportCalendarDayHTML(byDate.get(date)||[],kind==='report')}</button>`;
 }

 return `<section class="panel calendar-section customer-calendar customer-calendar-${kind}"><div class="panelhead"><h2>${kind==='ar'?(s.basis==='dueDate'?'ยอดค้าง · ':'วันนัดรับเงิน · '):''}${esc(monthLabel)}</h2>${secondary?'':calendarRangeToolbar(kind,s.month)}${secondary?'':`<div class="customer-calendar-controls"><button class="secondary" data-customer-shift="-1" aria-label="เดือนก่อนหน้า">‹</button><label>เดือน <input type="month" id="customer-calendar-month" value="${s.month}"></label>${calendarYearHTML(s.month)}<button class="secondary" data-customer-shift="1" aria-label="เดือนถัดไป">›</button>${kind==='ar'&&typeof arCalendarTabs==='function'?arCalendarTabs():''}</div>`}</div><p class="customer-calendar-note">แหล่งข้อมูล: PF + Novat + TNP · ยอดตามตัวกรองปัจจุบัน${kind==='report'?' · จัดตามวันที่บิล ยอดค้างเป็นยอดปัจจุบันของบิล ไม่ใช่ยอดย้อนหลังรายวัน':s.basis==='dueDate'?' · ยอดค้างตามวันครบกำหนดหน้าบิล':' · ยอดนัดรับคำนวณจากยอดค้างปัจจุบันของบิลที่มีวันนัดรับ · แต่ละบริษัทแยกพฤติกรรมการจ่าย พร้อมมูลค่า จำนวนราย และประเภทลูกค้า'} · ${kind==='report'?'ยอดขาย '+money(sum('sales'))+' บาท · ':''}${customerCalendarAmountLabel(kind)}เดือนนี้ ${money(sum('outstanding'))} บาท · กดวันที่เพื่อดูแยกรายลูกค้า</p><div class="scroll"><div class="calendar">${['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'].map(d=>`<div class="dayname">${d}</div>`).join('')}${cells}</div></div>${!shown.length?'<p class="customer-calendar-note">ไม่มีรายการในเดือนนี้ตามตัวกรอง</p>':''}${unknown.length?`<button class="secondary customer-calendar-undated" data-customer-day="unset">ยังไม่ระบุวันที่ · ${customerCalendarGroups(unknown).filter(r=>r.outstanding>0).length} รายลูกค้า · ดูรายละเอียด</button>`:''}${customerCalendarSummaryHTML(kind,s.month,records)}</section>`;
}
function customerCalendarDetail(kind,date,records){
 const rows=customerCalendarGroups(records.filter(r=>date==='unset'?!customerCalendarDate(r.date):r.date===date)).filter(r=>kind==='report'?['PF','TNP','NV'].includes(r.company)&&(r.sales!==0||r.outstanding!==0):r.outstanding!==0);
 customerCalendarShowDetail(kind,date==='unset'?'ยังไม่ระบุวันที่':arDate(date),rows);
}
function customerCalendarShowDetail(kind,title,rows){
 const cols=[{key:'company',label:'บริษัท'},{key:'code',label:'รหัสลูกค้า'},{key:'name',label:'ลูกค้า'},{key:'bills',label:'จำนวนบิล',type:'number'},...(kind==='report'?[{key:'sales',label:'ยอดขาย',type:'number'}]:[{key:'customerType',label:'ประเภทลูกค้า'},{key:'behaviorLabel',label:'พฤติกรรมการจ่าย'}]),{key:'outstanding',label:customerCalendarIsPromise(kind)?'ยอดนัดรับ (ยอดค้างปัจจุบัน)':'ยอดค้างปัจจุบัน',type:'number'}];
 const totals={name:'รวม',bills:rows.reduce((n,r)=>n+r.bills,0),sales:rows.reduce((n,r)=>n+r.sales,0),outstanding:rows.reduce((n,r)=>n+r.outstanding,0)},spec={kind:'ar',report:true,name:'ปฏิทินรายลูกค้า-'+title,cols,rows:[...rows,totals]};
 showCardDetail(title,`${rows.length} รายลูกค้า · ยอดตามตัวกรองปัจจุบัน`, `<div class="scroll"><table><thead><tr>${cols.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${spec.rows.map(r=>`<tr>${cols.map(c=>`<td class="${c.type==='number'?'money':''}">${reportFormat(r[c.key],c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,spec);
}
function customerCalendarSummaryDetailRows(records,start,end,key,behavior){
 const groups=customerCalendarGroups(records.filter(r=>customerCalendarDate(r.date)&&r.date>=start&&r.date<=end));
 return groups.filter(r=>(key==='sales'?r.sales!==0:key==='customers'?r.outstanding>0:key==='outstanding'?r.outstanding!==0:r.company===key&&r.outstanding!==0)&&(behavior===undefined||(r.behaviorLabel||'ยังไม่มีข้อมูล')===behavior));
}
function bindCustomerCalendar(kind,rows){
 const s=customerCalendarState[kind],refresh=()=>kind==='ar'?arRender():reportRender();
 document.querySelectorAll('[data-customer-mode]').forEach(b=>b.onclick=()=>{s.mode=b.dataset.customerMode.split(':')[1];refresh()});
 if(s.mode!=='calendar')return;
 const records=customerCalendarRecords(kind,rows);if(records===null)return;
 bindCalendarRange(kind,refresh,()=>customerCalendarRangeExport(kind,rows));
 const choices=customerCalendarMonthChoices(kind);if(choices&&!choices.length)return;
 document.querySelectorAll('[data-customer-shift]').forEach(b=>{const shift=Number(b.dataset.customerShift),index=choices?.indexOf(s.month);b.disabled=!!choices&&!choices[index+shift];b.onclick=()=>{const d=new Date(s.month+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+shift);const next=choices?choices[choices.indexOf(s.month)+shift]:d.toISOString().slice(0,7);if(next&&customerCalendarSetMonth(kind,next))refresh()}});
 const monthInput=$('#customer-calendar-month');if(choices){monthInput.min=choices[0];monthInput.max=choices.at(-1)}
 monthInput.onchange=e=>{if(customerCalendarSetMonth(kind,e.target.value))refresh();else e.target.value=s.month};
 bindCalendarYear(s.month,choices,next=>{if(customerCalendarSetMonth(kind,next))refresh()});

 document.querySelectorAll('[data-customer-day]').forEach(b=>b.onclick=()=>customerCalendarDetail(kind,b.dataset.customerDay,records));
 document.querySelectorAll('[data-customer-summary-start]').forEach(b=>b.onclick=()=>{
  const {customerSummaryStart:start,customerSummaryEnd:end,customerSummaryKey:key,customerSummaryBehavior:behavior}=b.dataset;
  const selected=customerCalendarSummaryDetailRows(records,start,end,key,behavior);
  customerCalendarShowDetail(kind,`${b.getAttribute('aria-label').replace(' · ดูรายละเอียด','')} · ${arDate(start)} – ${arDate(end)}`,selected);
 });
}
