/* Work dates use the existing collection policy; amounts count appointments once. */
let arCalendarTab='tasks';
const arTaskCalendarState={month:'',company:'all',type:'all',owner:'all',status:'all'};
const arTaskTypes={promise:'นัดรับเงิน',phone:'โทร / ติดต่อ',letter:'หนังสือแจ้ง',missed:'ผิดนัด',other:'งานติดตามอื่น'};
const arTaskCompletionFields={verify:'verifiedDate',contact:'contactDate',l1:'letter1',l2:'letter2',l3:'letter3',lock:'lockDate','insurance-prepare':'insurancePreparedDate','insurance-claim':'claimDate',escalate:'l2ReceivedDate','l2-negotiate':'l2NegotiatedDate'};
function arCalendarTabs(){return `<label class="ar-calendar-view-filter">ข้อมูลในปฏิทิน<select id="ar-calendar-view" aria-label="ข้อมูลในปฏิทิน">${[['tasks','งานติดตามหนี้'],['outstanding','ยอดค้าง'],['promise','วันนัดรับเงิน']].map(([key,label])=>`<option value="${key}" ${arCalendarTab===key?'selected':''}>${label}</option>`).join('')}</select></label>`}

function arTaskCalendarToolbarHTML(){return `<section class="ar-calendar-toolbar" aria-label="ค้นหาและประเมินงานติดตามหนี้"><div class="ar-calendar-toolbar-actions"><button type="button" class="secondary" id="ar-new">เพิ่มบิลด้วยฟอร์ม</button><button type="button" class="secondary" id="ar-notice-open">แจ้งเตือนงาน (${arNoticeList().length})</button></div><div class="ar-calendar-toolbar-search"><label>ค้นหาลูกค้า / บิล<input id="ar-search" type="search" placeholder="ค้นหาข้อมูลทุกคอลัมน์" value="${esc(arSearch)}"></label><label>ค้นหาจาก${searchSelectHTML('ar-search-column',arSearchColumnsMap(),arSearchColumn)}</label></div><div class="ar-calendar-toolbar-date"><label>ประเมินงาน ณ วันที่<input id="ar-asof" type="date" value="${arAsOf}"></label><button type="button" class="secondary" id="ar-today">วันนี้</button></div></section>`}
function arTaskCalendarInvoices(){return arInvoices.filter(i=>(typeof sourceInvoiceVisible!=='function'||sourceInvoiceVisible(i))&&(typeof arPriorityMatches!=='function'||arPriorityMatches(i))&&(typeof arInvoiceMatch!=='function'||arInvoiceMatch(i)))}
function arPlanToolbarHTML(){return arTaskCalendarToolbarHTML().replace('class="ar-calendar-toolbar"','class="ar-calendar-toolbar ar-plan-toolbar"').replace('</div><div class="ar-calendar-toolbar-date">',`${arPriorityFilterHTML()}</div><div class="ar-calendar-toolbar-date">`)}
function arTaskCalendarEvents(invoices,asOf=arAsOf){
 const events=[];
 for(const i of invoices){
  const balance=arOutstanding(i),company=debtorCompany(i.sourceCompany),base={invoiceId:i.id,company,code:i.sourceCustomerCode||'',customer:i.customer,bill:i.billNo,balance,priority:typeof arPriority==='function'?arPriority(i,asOf).key:'normal'};
  const push=(key,date,type,title,owner,done,deadline=date,note='')=>{if(customerCalendarDate(date))events.push({...base,id:i.id+'|'+key,key,date,type,title,owner,done,deadline,note,status:done?'done':deadline<asOf?'late':date<=asOf?'action':'future'})};
  if(balance>0){
   if(customerCalendarDate(i.promiseDate)){push('promise',i.promiseDate,'promise','นัดรับเงินจากลูกค้า','L1',false);if(i.promiseDate<asOf)push('missed',asOf,'missed','เลยวันนัด ยังมียอดค้าง','L1',false,i.promiseDate)}
   for(const t of arTasks(i,asOf)){
    // Completed work is placed on its actual recorded date below.
    if(t.done)continue;
    const type=['daily','contact','l2-negotiate'].includes(t.key)?'phone':['l1','l2','l3'].includes(t.key)?'letter':'other';
    push(t.key,t.start<=asOf?asOf:t.start,type,t.title,t.owner,false,t.deadline,t.detail);
   }
  }
  for(const [key,field] of Object.entries(arTaskCompletionFields))if(customerCalendarDate(i[field])){
   const title={verify:'ตรวจยอดและเอกสารแล้ว',contact:'ยืนยันกำหนดรับแล้ว',l1:'ส่งหนังสือฉบับที่ 1 แล้ว',l2:'ส่งหนังสือฉบับที่ 2 แล้ว',l3:'ส่งหนังสือฉบับที่ 3 แล้ว',lock:'บันทึกระงับการขายแล้ว','insurance-prepare':'เตรียมเอกสารประกันแล้ว','insurance-claim':'ยื่นประกันแล้ว',escalate:'L2 รับเรื่องแล้ว','l2-negotiate':'L2 เจรจาแล้ว'}[key];
   push(key,i[field],['l1','l2','l3'].includes(key)?'letter':['contact','l2-negotiate'].includes(key)?'phone':'other',title,['l2-negotiate','lock'].includes(key)?'L2':'L1',true);
  }
  (i.logs||[]).forEach((log,index)=>push('log-'+index,log.date,'phone','บันทึกติดตามแล้ว',log.by||'L1',true,log.date,log.result||''));
 }
 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.deadline.localeCompare(b.deadline)||a.customer.localeCompare(b.customer,'th'));
}
function arTaskCalendarFilter(events){const s=arTaskCalendarState;return calendarRangeRows('tasks',events).filter(e=>(s.company==='all'||e.company===s.company)&&(s.type==='all'||e.type===s.type)&&(s.owner==='all'||e.owner===s.owner)&&(s.status==='all'||(s.status==='open'?!e.done:e.status===s.status)))}
function arTaskCalendarStats(events){
 const promises=new Map(events.filter(e=>e.type==='promise'&&!e.done).map(e=>[e.invoiceId,e]));
 return {tasks:events.length,done:events.filter(e=>e.done).length,late:events.filter(e=>e.status==='late').length,promiseAmount:[...promises.values()].reduce((n,e)=>n+e.balance,0)};
}
const arCalendarPriorityHearts={urgent:'\u{1FA77}',high:'\u{1F9E1}',normal:'\u{1F49A}'};
const arCalendarPriorityLabels={urgent:'เร่งด่วน',high:'สำคัญ',normal:'ปกติ'};
function arTaskCalendarPriorityHTML(date,events){
 const pending=events.filter(e=>!e.done);
 if(!pending.length)return '';
 return `<div class="ar-day-priorities" aria-label="งานที่ยังไม่เสร็จแยกตามความสำคัญ">${Object.entries(arCalendarPriorityLabels).map(([key,label])=>{const selected=pending.filter(e=>e.priority===key);return selected.length?`<button type="button" class="ar-day-priority ${key}" data-ar-priority-day="${date}" data-ar-priority-key="${key}" aria-label="${label} ${selected.length} งาน · ดูรายละเอียด"><span><span aria-hidden="true">${arCalendarPriorityHearts[key]}</span> ${label}</span><strong>${selected.length} งาน</strong></button>`:''}).join('')}</div>`;
}
function arTaskCalendarHTML(){
 const s=arTaskCalendarState;if(!s.month)s.month=arAsOf.slice(0,7);const range=calendarRanges.tasks;if(!range)return arTaskCalendarMonthHTML();
 const html=calendarRangeMonths(range).map((month,index)=>{s.month=month;const content=arTaskCalendarMonthHTML(index>0);return index?content.slice(content.indexOf('<section class="panel calendar-section ar-task-calendar">')):content}).join('');s.month=range.start.slice(0,7);return html;
}
function arTaskCalendarMonthHTML(secondary=false){
 const s=arTaskCalendarState;if(!s.month)s.month=arAsOf.slice(0,7);
 const all=arTaskCalendarEvents(arTaskCalendarInvoices()),events=arTaskCalendarFilter(all),shown=events.filter(e=>e.date.slice(0,7)===s.month),stats=arTaskCalendarStats(calendarRanges.tasks?events:shown),byDate=new Map();
 for(const e of shown){if(!byDate.has(e.date))byDate.set(e.date,[]);byDate.get(e.date).push(e)}
 const first=new Date(s.month+'-01T00:00:00Z'),days=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate(),label=new Intl.DateTimeFormat('th-TH',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
 const select=(key,label,options)=>`<label>${label}<select data-ar-task-filter="${key}"><option value="all">ทั้งหมด</option>${Object.entries(options).map(([value,text])=>`<option value="${esc(value)}" ${s[key]===value?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
 const owners=Object.fromEntries([...new Set(all.map(e=>e.owner))].sort().map(v=>[v,v]));
 let cells='<div class="day" aria-hidden="true"></div>'.repeat(first.getUTCDay());
 for(let day=1;day<=days;day++){
  const date=s.month+'-'+String(day).padStart(2,'0'),items=byDate.get(date)||[],count=arTaskCalendarStats(items);
  cells+=`<div class="day ar-task-day ${calendarRanges.tasks&&(date<calendarRanges.tasks.start||date>calendarRanges.tasks.end)?'outside-range':''} ${date===arAsOf?'is-today':''}"><b>${day}</b>${arTaskCalendarPriorityHTML(date,items)}${Object.entries(arTaskTypes).map(([key,name])=>{const group=items.filter(e=>e.type===key&&!e.done);if(!group.length)return '';const customers=new Set(group.map(e=>JSON.stringify([e.company,e.code||e.customer]))).size;return `<button class="ar-task-chip ${key}" data-ar-task-day="${date}" data-ar-task-type="${key}"><span>${name}</span><strong>${key==='promise'?money(arTaskCalendarStats(group).promiseAmount)+' บาท':group.length+' งาน'}</strong><small>${customers} ราย</small></button>`}).join('')}${count.done?`<button class="ar-task-chip done" data-ar-task-day="${date}" data-ar-task-type="done"><span>ทำแล้ว</span><strong>${count.done} / ${count.tasks} งาน</strong></button>`:''}${!items.length?'<small class="ar-task-empty">ไม่มีงานตามตัวกรอง</small>':''}</div>`;
 }
 const summary=customerCalendarSummary(s.month,[],calendarRanges.tasks),summaryRow=row=>{const items=shown.filter(e=>e.date>=row.start&&e.date<=row.end),n=arTaskCalendarStats(items);return `<tr><th>${row.label}<small>${arDate(row.start)} – ${arDate(row.end)}</small></th>${[n.tasks,n.done,n.late,money(n.promiseAmount)].map(value=>`<td class="money"><button class="calendar-summary-value" data-ar-task-start="${row.start}" data-ar-task-end="${row.end}">${value}</button></td>`).join('')}</tr>`};
 const noDate=arTaskCalendarInvoices().filter(i=>arOutstanding(i)>0&&!customerCalendarDate(i.dueDate)&&!customerCalendarDate(i.promiseDate)&&(s.company==='all'||debtorCompany(i.sourceCompany)===s.company));
 return `<div class="report-filters ar-task-filters">${select('company','บริษัท',{PF:'PF',TNP:'TNP',NV:'NV'})}${select('type','ประเภทงาน',arTaskTypes)}${select('owner','ผู้รับผิดชอบ / บทบาท',owners)}${select('status','สถานะงาน',{open:'ยังไม่เสร็จ',late:'เกินกำหนด',action:'ถึงกำหนด',future:'งานล่วงหน้า',done:'ทำแล้ว'})}<label class="report-affiliate-toggle"><input id="source-affiliates" type="checkbox" ${typeof sourceArIncludeAffiliates!=='undefined'&&sourceArIncludeAffiliates?'checked':''}> รวมลูกค้าในเครือ</label></div><div class="report-metrics ar-task-metrics"><div><small>งานเดือนนี้ตามตัวกรอง</small><strong>${stats.tasks.toLocaleString('th-TH')}</strong></div><div class="report-rose"><small>งานเกินกำหนด</small><strong>${stats.late.toLocaleString('th-TH')}</strong></div><div><small>ทำแล้ว</small><strong>${stats.done.toLocaleString('th-TH')} / ${stats.tasks.toLocaleString('th-TH')}</strong></div><div><small>ยอดนัดรับเดือนนี้ · บาท</small><strong>${money(stats.promiseAmount)}</strong></div></div><section class="panel calendar-section ar-task-calendar"><div class="panelhead"><h2>งานติดตามหนี้ · ${esc(label)}</h2>${secondary?'':calendarRangeToolbar('tasks',s.month)}${secondary?'':`<div class="customer-calendar-controls"><button class="secondary" data-ar-task-shift="-1" aria-label="เดือนก่อนหน้า">‹</button><label>เดือน <input id="ar-task-month" type="month" value="${s.month}"></label>${calendarYearHTML(s.month)}<button class="secondary" data-ar-task-shift="1" aria-label="เดือนถัดไป">›</button><button class="secondary" id="ar-task-today">งานวันนี้</button>${arCalendarTabs()}${arPriorityFilterHTML()}</div>`}</div><p class="customer-calendar-note">ประเมิน ณ ${arDate(arAsOf)} · งานเกินกำหนดและผิดนัดยกมาแสดง ณ วันที่ประเมินจนกว่าจะบันทึกผล · คลิกประเภทงานเพื่อดูรายชื่อและบันทึกติดตาม · ยอดเงินนับเฉพาะนัดรับหนึ่งครั้งต่อบิล ไม่บวกซ้ำตามจำนวนงาน · ใช้คำค้นและความสำคัญด้านบน · เดือนงานแยกจากช่วงวันนัดรับของแผนรับ</p><div class="scroll"><div class="calendar">${['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'].map(d=>`<div class="dayname">${d}</div>`).join('')}${cells}</div></div><div class="calendar-summary"><div class="calendar-summary-heading"><h3>สรุปรายสัปดาห์และรายเดือน</h3><span>ตามเดือนงานและตัวกรอง</span></div><div class="scroll"><table><thead><tr><th>ช่วงวันที่</th><th>งานทั้งหมด</th><th>ทำแล้ว</th><th>เกินกำหนด</th><th>ยอดนัดรับ (บาท)</th></tr></thead><tbody>${summary.weeks.map(summaryRow).join('')}</tbody><tfoot>${summaryRow(summary.month)}</tfoot></table></div></div></section>${noDate.length?`<p class="notice">มี ${noDate.length} บิลค้างที่ยังไม่มีวันครบกำหนดและวันนัดรับ จึงยังสร้างกำหนดงานไม่ได้ · กำหนดวันที่ในแผนรับก่อน</p>`:''}`;
}
function arTaskCalendarSpec(events){
 const cols=[{key:'company',label:'บริษัท'},{key:'customer',label:'ลูกค้า'},{key:'bill',label:'เลขบิล'},{key:'title',label:'งาน'},{key:'date',label:'วันที่แสดง',type:'date'},{key:'deadline',label:'กำหนดเดิม',type:'date'},{key:'owner',label:'ผู้รับผิดชอบ / บทบาท'},{key:'state',label:'สถานะ'},{key:'priorityLabel',label:'ความสำคัญ ณ วันที่ประเมิน'},{key:'balance',label:'ยอดค้างบิล (ไม่รวมซ้ำ)',type:'number'},{key:'note',label:'รายละเอียด / ผลติดตาม'}],rows=events.map(e=>({...e,priorityLabel:arCalendarPriorityLabels[e.priority]||'—',state:e.done?'ทำแล้ว':e.status==='late'?'เกินกำหนด':e.status==='future'?'ล่วงหน้า':'ถึงกำหนด'}));
 return {kind:'ar',report:true,name:'งานติดตามหนี้',cols,rows};
}
function arTaskCalendarExportSpec(){return arTaskCalendarSpec(arTaskCalendarFilter(arTaskCalendarEvents(arTaskCalendarInvoices())).filter(e=>calendarRanges.tasks||e.date.slice(0,7)===(arTaskCalendarState.month||arAsOf.slice(0,7))))}
function arTaskCalendarOpen(events,title,page=0){
 const spec=arTaskCalendarSpec(events),{cols,rows}=spec;page=Math.max(0,Math.min(page,Math.ceil(rows.length/100)-1));const visible=rows.slice(page*100,(page+1)*100);
 showCardDetail(title,`${rows.length} งาน · ยอดค้างอาจเป็นบิลเดียวกัน ห้ามบวกรวมซ้ำ · เลือกบันทึกผลเพื่อเปิดบิลเดิม`, `<div class="scroll"><table><thead><tr>${cols.map(c=>`<th>${c.label}</th>`).join('')}<th>บันทึกผล</th></tr></thead><tbody>${visible.map(r=>`<tr>${cols.map(c=>`<td>${reportFormat(r[c.key],c)}</td>`).join('')}<td><button class="secondary" data-ar-task-invoice="${esc(r.invoiceId)}">บันทึกผล / เปลี่ยนนัด</button><button class="secondary" data-ar-task-edit="${esc(r.invoiceId)}">วันส่งหนังสือ / แก้ข้อมูล</button></td></tr>`).join('')||`<tr><td colspan="12">ไม่มีงานตามตัวกรอง</td></tr>`}</tbody></table></div><div class="source-pagination"><span>แสดง ${rows.length?page*100+1:0}–${Math.min((page+1)*100,rows.length)} จาก ${rows.length} งาน · ส่งออก Excel ได้ทั้งชุด</span><button class="secondary" data-ar-task-page="${page-1}" ${page===0?'disabled':''}>ก่อนหน้า</button><button class="secondary" data-ar-task-page="${page+1}" ${(page+1)*100>=rows.length?'disabled':''}>ถัดไป</button></div>`,spec);
 document.querySelectorAll('[data-ar-task-page]').forEach(b=>b.onclick=()=>arTaskCalendarOpen(events,title,Number(b.dataset.arTaskPage)));
 document.querySelectorAll('[data-ar-task-invoice]').forEach(b=>b.onclick=()=>{$('#card-detail').close();arOpenDetail(b.dataset.arTaskInvoice)});
 document.querySelectorAll('[data-ar-task-edit]').forEach(b=>b.onclick=()=>{$('#card-detail').close();arOpenInvoice(b.dataset.arTaskEdit)});
}
const arCalendarBalanceStates={outstanding:{month:'',range:null},promise:{month:'',range:null}};
function arCalendarSelectView(value){
 if(!['tasks','outstanding','promise'].includes(value))return false;
 if(arCalendarBalanceStates[arCalendarTab])arCalendarBalanceStates[arCalendarTab]={month:customerCalendarState.ar.month,range:calendarRanges.ar};
 arCalendarTab=value;
 if(arCalendarBalanceStates[value]){customerCalendarState.ar.basis=value==='outstanding'?'dueDate':'promiseDate';customerCalendarState.ar.month=arCalendarBalanceStates[value].month;calendarRanges.ar=arCalendarBalanceStates[value].range}
 return true;
}
function bindArCalendarTabs(){const input=$('#ar-calendar-view');if(input)input.onchange=()=>{if(arCalendarSelectView(input.value))arRender()}}


function bindArTaskCalendar(){
 const s=arTaskCalendarState;
 bindCalendarRange('tasks',()=>arRender(),()=>arTaskCalendarExportSpec());
 document.querySelectorAll('[data-ar-task-filter]').forEach(input=>input.onchange=()=>{s[input.dataset.arTaskFilter]=input.value;arRender()});
 bindCalendarYear(s.month,null,next=>{s.month=next;arRender()});
 $('#ar-task-month').onchange=e=>{if(customerCalendarDate(e.target.value+'-01')){s.month=e.target.value;arRender()}};
 document.querySelectorAll('[data-ar-task-shift]').forEach(b=>b.onclick=()=>{const date=new Date(s.month+'-01T00:00:00Z');date.setUTCMonth(date.getUTCMonth()+Number(b.dataset.arTaskShift));s.month=date.toISOString().slice(0,7);arRender()});
 $('#ar-task-today').onclick=()=>{arAsOf=bangkokToday();s.month=arAsOf.slice(0,7);calendarRanges.tasks=calendarRangeDates(s.month);arRender();const events=arTaskCalendarFilter(arTaskCalendarEvents(arTaskCalendarInvoices())).filter(e=>e.date===arAsOf);arTaskCalendarOpen(events,'งานวันนี้ · '+arDate(arAsOf))};
 const events=arTaskCalendarFilter(arTaskCalendarEvents(arTaskCalendarInvoices()));
 document.querySelectorAll('[data-ar-priority-day]').forEach(b=>b.onclick=()=>arTaskCalendarOpen(events.filter(e=>!e.done&&e.date===b.dataset.arPriorityDay&&e.priority===b.dataset.arPriorityKey),arCalendarPriorityLabels[b.dataset.arPriorityKey]+' · '+arDate(b.dataset.arPriorityDay)));
 document.querySelectorAll('[data-ar-task-day]').forEach(b=>b.onclick=()=>{const type=b.dataset.arTaskType;arTaskCalendarOpen(events.filter(e=>e.date===b.dataset.arTaskDay&&(type==='done'?e.done:!e.done&&e.type===type)),(arTaskTypes[type]||'ทำแล้ว')+' · '+arDate(b.dataset.arTaskDay))});
 document.querySelectorAll('[data-ar-task-start]').forEach(b=>b.onclick=()=>arTaskCalendarOpen(events.filter(e=>e.date>=b.dataset.arTaskStart&&e.date<=b.dataset.arTaskEnd),'งานติดตาม · '+arDate(b.dataset.arTaskStart)+' – '+arDate(b.dataset.arTaskEnd)));
}
