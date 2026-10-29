/* Workbook snapshot reports, optionally linked to confirmed receipts through per-bill source keys. */
let reportData=null,reportLoadError='',reportLoading=null;
const reportState={monthly:{query:'',column:'all',company:'all',type:'all',salesperson:'all',credit:'all',from:'',to:''},credit:{query:'',column:'all',company:'all',type:'all',group:'all',comparison:'all'}};
const reportKind=()=>view==='report-monthly'?'monthly':'credit';
async function loadReports(){
 if(reportData)return;
 if(!reportLoading)reportLoading=fetch('reports-data.json').then(r=>{if(!r.ok)throw Error('อ่านข้อมูลรายงานไม่สำเร็จ');return r.json()}).then(d=>{reportData=typeof reportStored==='function'?(reportStored()||d):d;const m=reportData.monthly.months;reportState.monthly.from=m[0]?.key||'';reportState.monthly.to=m.at(-1)?.key||''}).catch(e=>{reportLoadError=e.message}).finally(()=>{if(view.startsWith('report-'))render()});
 await reportLoading;
}
const reportTotalKeys=()=>reportData.monthly.columns.slice(-2).map(c=>c.key);
function reportSelectedMonths(){let s=reportState.monthly;return reportData.monthly.months.filter(m=>m.key>=s.from&&m.key<=s.to)}
function reportColumns(kind=reportKind()){
 let all=reportData[kind].columns;
 if(kind==='credit')return all;
 let months=reportSelectedMonths(),ids=new Set([...Array(8).keys(),...months.flatMap(m=>[m.sales,m.outstanding]),...reportTotalKeys().map(k=>Number(k.slice(1)))]);
 return all.filter((c,i)=>ids.has(i)).map(c=>reportTotalKeys().includes(c.key)?{...c,label:c.key===reportTotalKeys()[0]?'รวมยอดขาย (เดือนที่เลือก)':'รวมยอดค้าง (เดือนที่เลือก)'}:c);
}
function reportValue(row,key,kind=reportKind()){
 let i=Number(key.slice(1));
 if(kind==='monthly'&&reportTotalKeys().includes(key))return reportSelectedMonths().reduce((sum,m)=>sum+Number(reportValue(row,'c'+(key===reportTotalKeys()[0]?m.sales:m.outstanding),kind)||0),0);
 return typeof reportLiveValue==='function'?reportLiveValue(row,key,kind):row[i]??'';
}
function reportRows(kind=reportKind()){if(typeof reportRefreshLive==='function')reportRefreshLive();
 let s=reportState[kind],cols=reportData[kind].columns;
 return reportData[kind].rows.filter(r=>{
  if(s.company!=='all'&&String(r[1]??'')!==s.company)return false;
  if(s.type!=='all'&&String(r[kind==='monthly'?5:4]??'')!==s.type)return false;
  if(kind==='monthly'&&((s.salesperson!=='all'&&String(r[3]??'')!==s.salesperson)||(s.credit!=='all'&&String(r[6]??'')!==s.credit)))return false;
  if(kind==='credit'&&((s.group!=='all'&&String(r[12]??'')!==s.group)||(s.comparison!=='all'&&String(r[10]??'')!==s.comparison)))return false;
  let keys=s.column==='all'?cols.map(c=>c.key):[s.column],hay=keys.map(k=>String(reportValue(r,k,kind))).join(' ').normalize('NFKC').toLowerCase().replaceAll(',','');
  return s.query.trim().normalize('NFKC').toLowerCase().replaceAll(',','').split(/\s+/).every(word=>hay.includes(word));
 });
}
function reportSelect(id,label,index,kind=reportKind()){
 let s=reportState[kind],values=[...new Set(reportData[kind].rows.map(r=>String(r[index]??'')))].filter(Boolean).sort((a,b)=>a.localeCompare(b,'th'));
 return `<label>${esc(label)}<select data-report-filter="${id}"><option value="all">ทั้งหมด</option>${values.map(v=>`<option value="${esc(v)}" ${s[id]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
}
function reportFormat(value,col){if(value===''||value===null||value===undefined)return '—';return col.type==='number'&&col.key!=='c0'?Number(value).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2}):esc(value)}
function reportRender(){
 document.querySelector('main > .toolbar').hidden=true;
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $('#title').textContent=view==='report-monthly'?'ยอดขาย-ค้างรายเดือน':'รายชื่อลูกค้าและเครดิต';
 $('.eyebrow').textContent='FINANCE WORKSPACE / รายงานจาก Excel';
 $('#add').hidden=true;
 if(!reportData){$('#content').innerHTML=`<div class="notice">${reportLoadError?esc(reportLoadError):'กำลังอ่านรายงาน…'}</div>`;if(!reportLoadError)loadReports();return}
 let kind=reportKind(),s=reportState[kind],cols=reportColumns(),rows=reportRows(),monthly=kind==='monthly';
 const total=key=>rows.reduce((n,r)=>n+Number(reportValue(r,key)||0),0);
 let months=monthly?`<label>ตั้งแต่เดือน<select data-report-filter="from">${reportData.monthly.months.map(m=>`<option value="${m.key}" ${s.from===m.key?'selected':''}>${esc(m.label)}</option>`).join('')}</select></label><label>ถึงเดือน<select data-report-filter="to">${reportData.monthly.months.map(m=>`<option value="${m.key}" ${s.to===m.key?'selected':''}>${esc(m.label)}</option>`).join('')}</select></label>`:'';
 $('#content').innerHTML=`<section class="report-workspace"><div class="report-intro"><div><span class="report-kicker">รายงาน · ${reportData[kind].year||reportData.year}</span><h2>${monthly?'ยอดขายและยอดค้าง แยกรายลูกค้า':'เครดิตเดิม เทียบเงื่อนไขการชำระของลูกค้า'}</h2><p>แหล่งข้อมูล: ${esc(reportData[kind].source||reportData.source)} · ${reportData[kind].rows.length} รายการต้นทาง</p></div><button class="primary" id="report-export">Export Excel สี</button></div><div class="report-note">${esc(reportData[kind].note)}${!monthly?(reportData.method==='raw-v1'?' · รายชื่อรวมจากยอดขาย ลูกหนี้ และข้อมูลลูกค้า':' · ตารางนี้มีเฉพาะรายชื่อที่ปรากฏในชีตต้นทาง ไม่ใช่ลูกค้าทั้งหมดของตารางยอดขาย'):''}<br>${reportData[kind].cashLink?'ยอดค้างเชื่อมรับจริงหลังวันที่ '+esc(reportData[kind].cashLink.asOf)+' · ยอดขายและเครดิตยังอ้างอิงต้นทาง · ไม่หักยอดรับในวัน snapshot ซ้ำ':'รายงานนี้ยังไม่มีข้อมูลรายบิลสำหรับเชื่อมรับจริง · ยอดค้างอ้างอิงไฟล์ที่นำเข้า'}</div><div class="report-auto-panel"><div><b>อัปเดตรายงานอัตโนมัติจาก Excel</b><p>นำเข้ายอดขาย + ลูกหนี้คงค้าง · ระบบดึงข้อมูลลูกค้าและเครดิตจากยอดขาย แล้วคำนวณรายงานให้ · หรือเลือกไฟล์สองชีตที่สรุปแล้ว</p><small>ทำงานในเบราว์เซอร์นี้ · ยังไม่ดึงไฟล์ตามเวลาและไม่ใช้บริการ AI ภายนอก</small></div><div><button class="primary" id="report-raw-open">นำเข้ารายงานต้นทาง</button> <button class="secondary" id="report-auto-open">เลือกไฟล์และอัปเดตอัตโนมัติ</button> <button class="secondary" id="report-auto-undo">ย้อนกลับชุดก่อนหน้า</button></div><div id="report-auto-status" role="status">${reportData.updatedAt?'อัปเดตล่าสุด '+esc(new Date(reportData.updatedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})):'ข้อมูลตั้งต้นจากไฟล์แนบ'}</div></div><div class="report-filters">${months}${reportSelect('company','บริษัท',1)}${reportSelect('type','ประเภทลูกค้า',monthly?5:4)}${monthly?reportSelect('salesperson','ชื่อฝ่ายขาย',3)+reportSelect('credit','เครดิต',6):reportSelect('group','กลุ่มเครดิตตามลูกค้า',12)+reportSelect('comparison','ผลเทียบเครดิต',10)}</div><div class="report-search"><select id="report-search-column" aria-label="หัวตารางค้นหา"><option value="all">ค้นหาทุกหัวตาราง</option>${reportData[kind].columns.map(c=>`<option value="${c.key}" ${s.column===c.key?'selected':''}>${esc(c.label)}</option>`).join('')}</select><input id="report-search" type="search" placeholder="ค้นหาชื่อ รหัสลูกค้า เครดิต หรือข้อมูลในตาราง…" value="${esc(s.query)}" aria-label="ค้นหารายงาน"><button class="secondary" id="report-reset">ล้างตัวกรอง</button></div><div class="report-metrics"><div><small>รายการที่ตรงตัวกรอง</small><strong>${rows.length.toLocaleString('th-TH')}</strong></div>${monthly?`<div><small>ยอดขายรวมเดือนที่เลือก</small><strong>${money(total(reportTotalKeys()[0]))}</strong></div><div class="report-rose"><small>ยอดค้างตามเดือนเอกสารที่เลือก</small><strong>${money(total(reportTotalKeys()[1]))}</strong></div>`:`<div class="report-rose"><small>ยอดค้างรวมตามตัวกรอง</small><strong>${money(total('c7'))}</strong></div><div><small>ไม่พบเงื่อนไขลูกค้าใน Report</small><strong>${rows.filter(r=>String(r[10]).includes('ไม่พบ')).length}</strong></div>`}</div><div class="report-table-wrap"><table class="report-table"><thead>${monthly?`<tr class="report-group-head">${cols.slice(0,8).map(c=>`<th rowspan="2">${esc(c.label)}</th>`).join('')}${reportSelectedMonths().map(m=>`<th colspan="2">${esc(m.label)}</th>`).join('')}<th rowspan="2">รวมยอดขาย<br>เดือนที่เลือก</th><th rowspan="2">รวมยอดค้าง<br>เดือนที่เลือก</th></tr><tr>${reportSelectedMonths().map(()=>'<th>ยอดขาย</th><th class="report-debt-head">ยอดค้าง</th>').join('')}</tr>`:`<tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr>`}</thead><tbody><tr class="report-total">${cols.map((c,i)=>`<td class="${c.type==='number'?'money':''}">${i===0?'รวม':(monthly?Number(c.key.slice(1))>=8:c.key==='c7')?reportFormat(total(c.key),c):''}</td>`).join('')}</tr>${rows.map(r=>`<tr>${cols.map(c=>`<td class="${c.type==='number'?'money':''} ${monthly&&Number(c.key.slice(1))>=8&&Number(c.key.slice(1))%2===1?'report-debt':''} ${!monthly&&['c8','c9','c11'].includes(c.key)?'report-customer-terms':''}">${reportFormat(reportValue(r,c.key),c)}</td>`).join('')}</tr>`).join('')}${!rows.length?`<tr><td colspan="${cols.length}" class="empty">ไม่พบรายการตามตัวกรอง</td></tr>`:''}</tbody></table></div><p class="helper">ตารางเลื่อนแนวนอนได้ · ช่องว่างแสดง — โดยไม่ถือว่าเป็นเครดิตเงินสด · ยอดเงินเป็นบาท รวม VAT ตามไฟล์ต้นทาง</p></section>`;
 document.querySelectorAll('[data-report-filter]').forEach(el=>el.onchange=()=>{s[el.dataset.reportFilter]=el.value;if(monthly&&s.from>s.to){if(el.dataset.reportFilter==='from')s.to=s.from;else s.from=s.to}reportRender()});
 $('#report-search-column').onchange=e=>{s.column=e.target.value;reportRender()};
 $('#report-search').oninput=e=>{s.query=e.target.value;const pos=e.target.selectionStart;reportRender();$('#report-search').focus();try{$('#report-search').setSelectionRange(pos,pos)}catch{}};
 $('#report-reset').onclick=()=>{for(let k of Object.keys(s))s[k]=['query','from','to'].includes(k)?'':'all';if(monthly){s.from=reportData.monthly.months[0].key;s.to=reportData.monthly.months.at(-1).key}reportRender()};
 $('#report-export').onclick=()=>exportStyledExcel();if(typeof reportBindAuto==='function')reportBindAuto();if($('#report-raw-open'))$('#report-raw-open').onclick=()=>rrOpen();
}
function reportExportSpec(){let kind=reportKind(),cols=reportColumns(),rows=reportRows().map(r=>Object.fromEntries(cols.map(c=>[c.key,reportValue(r,c.key)])));let totals={c0:'รวม'};for(let c of cols)if(kind==='monthly'?Number(c.key.slice(1))>=8:c.key==='c7')totals[c.key]=rows.reduce((a,r)=>a+Number(r[c.key]||0),0);return {kind:'ar',report:true,name:kind==='monthly'?'ยอดขาย-ค้างรายเดือน':'รายชื่อลูกค้าและเครดิต',cols,rows:[...rows,totals]}}
