/* Source drilldowns and editable customer terms; original workbook rows stay intact. */
const reportAffiliateCustomers=new Set([rrKey('โปรเฟส','0180-TNP'),rrKey('TNP','001-PFC')]);
const reportCustomerFields=['type','credit','customerCredit','terms','paymentType'];
const reportCustomerColumns=[{key:'type',label:'ประเภทลูกค้า'},{key:'credit',label:'เครดิตเดิม (วัน)'},{key:'customerCredit',label:'เครดิตตามลูกค้า (วัน)'},{key:'terms',label:'เงื่อนไขการชำระเงิน'},{key:'paymentType',label:'รูปแบบการจ่าย'}];
let reportEditor=null;
function reportCompanyCode(value){const n=reportNorm(value);return ['pf','profess','โปรเฟส'].includes(n)?'PF':['nv','novat'].includes(n)?'NV':['tnp','ทีเอ็นพี'].includes(n)?'TNP':String(value||'')}
function reportCompanyLabel(value){const code=reportCompanyCode(value);return {PF:'PF · โปรเฟส',NV:'NV · Novat',TNP:'TNP · ทีเอ็นพี'}[code]||String(value||'')}
function reportSourceKey(r){return reportCompanyCode(r.company)+'|'+String(r.code||'').trim().toUpperCase()+'|'+String(r.bill||'').trim().toUpperCase()}
function reportBillIndex(snapshot){
 const source=snapshot.rawSources||{},index=new Map(),asOf=source.ar?.asOf||snapshot.asOf||'';
 const ensure=r=>{const key=reportSourceKey(r);if(!index.has(key))index.set(key,{...r,sale:0,balance:0,hasAr:false,events:[]});return index.get(key)};
 for(const r of source.sales?.rows||[]){const item=ensure(r);item.sale+=Number(r.amount)||0;item.due=r.due||item.due||''}
 for(const r of source.ar?.rows||[]){const item=ensure(r);Object.assign(item,{...r,due:r.due||item.due||'',balance:Number(r.balance)||0,hasAr:true})}
 for(const r of source.receipts?.rows||[]){const item=ensure(r);item.events.push({...r,eventDate:r.receivedDate,eventType:r.settlementType==='credit-note'?'ใบลดหนี้':'รับชำระตามไฟล์',eventAmount:r.received})}
 const invoices=new Map((typeof arInvoices==='undefined'?[]:arInvoices).map(i=>[i.id,i]));
 for(const cash of typeof data==='undefined'?[]:data){if(cash.type!=='in'||cash.certainty!=='received')continue;const invoice=invoices.get(cash.arInvoiceId);if(!invoice)continue;const date=cash.receipt?.actualDate||cash.date;if(!date||!asOf)continue;const row={company:invoice.sourceCompany,code:invoice.sourceCustomerCode,bill:invoice.billNo},item=index.get(reportSourceKey(row));if(!item||date<=(item.snapshotAsOf||asOf))continue;const paid=Number.isFinite(cash.actualAmount)?cash.actualAmount:Number(cash.amount)||0;item.balance-=Math.min(Math.max(0,item.balance),Math.max(0,paid));item.events.push({...row,eventDate:date,eventType:'รับเงินจริงหลังชุดคงค้าง',eventAmount:paid,receiptNo:cash.receipt?.receiptNo||''})}
 return index;
}
let reportOverdueIndex=new Map();
let reportOverdueDaysIndex=new Map(),reportUnknownDueIndex=new Map();
function reportPrepareOverdue(snapshot){
 reportOverdueIndex=new Map();const today=typeof bangkokToday==='function'?bangkokToday():new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 reportOverdueDaysIndex=new Map();reportUnknownDueIndex=new Map();
 for(const bill of reportBillIndex(snapshot).values())if(bill.balance>0){
  const key=reportCompanyCode(bill.company)+'|'+String(bill.code).trim().toUpperCase(),month=String(Number(bill.date.slice(0,4))+543)+bill.date.slice(5,7);
  if(!bill.due||!Number.isFinite(Date.parse(bill.due))){if(!reportUnknownDueIndex.has(key))reportUnknownDueIndex.set(key,new Set());reportUnknownDueIndex.get(key).add(month);continue}
  if(bill.due>=today)continue;
  if(!reportOverdueIndex.has(key))reportOverdueIndex.set(key,new Set());reportOverdueIndex.get(key).add(month);
  if(!reportOverdueDaysIndex.has(key))reportOverdueDaysIndex.set(key,new Map());const days=reportOverdueDaysIndex.get(key),value=Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(bill.due+'T00:00:00Z'))/86400000);days.set(month,Math.max(days.get(month)||0,value));
 }
}
function reportOverdueDays(row,snapshot=reportData){
 if(!snapshot.rawSources?.ar)return '';
 if(typeof debtorReportExcluded==='function'&&debtorReportExcluded(row))return 0;
 const key=reportCompanyCode(row[1])+'|'+String(row[2]).trim().toUpperCase(),months=reportSelectedMonths(),days=reportOverdueDaysIndex.get(key),maximum=Math.max(0,...months.map(m=>days?.get(m.key)||0));
 return maximum|| (months.some(m=>reportUnknownDueIndex.get(key)?.has(m.key))?'':0);
}
function reportIsOverdueCell(row,key,snapshot=reportData){
 if(key==='overdueDays')return Number(reportOverdueDays(row,snapshot))>0;
 const targetMonth=snapshot.monthly.months.find(m=>'c'+m.outstanding===key);if(!targetMonth&&key!==snapshot.monthly.columns.at(-1).key)return false;
 if(typeof debtorReportExcluded==='function'&&debtorReportExcluded(row))return false;
 const months=reportOverdueIndex.get(reportCompanyCode(row[1])+'|'+String(row[2]).trim().toUpperCase());if(!months)return false;
 const month=snapshot.monthly.months.find(m=>'c'+m.outstanding===key);return month?months.has(month.key):key===snapshot.monthly.columns.at(-1).key&&reportSelectedMonths().some(m=>months.has(m.key));
}
function reportDebtDetail(rows,key,kind,snapshot){
 const customers=new Map(rows.map(r=>[reportCompanyCode(r[1])+'|'+String(r[2]).trim().toUpperCase(),r])),month=kind==='monthly'?snapshot.monthly.months.find(m=>'c'+m.outstanding===key):null,months=new Set(kind==='monthly'?(month?[month]:reportSelectedMonths()).map(m=>m.key):[]),details=[],events=[];
 for(const bill of reportBillIndex(snapshot).values()){
  const customer=customers.get(reportCompanyCode(bill.company)+'|'+String(bill.code).trim().toUpperCase());if(!customer||!bill.date||months.size&&!months.has(String(Number(bill.date.slice(0,4))+543)+bill.date.slice(5,7)))continue;
  const moved=kind==='monthly'&&typeof debtorExcluded==='function'&&debtorExcluded(bill.company,bill.code,bill.name||customer[4]),current=bill.balance,paid=bill.events.filter(e=>Number(e.eventAmount)>0).reduce((n,e)=>n+Number(e.eventAmount),0);
  const status=moved?'ย้ายไปสถานะลูกหนี้ กลุ่ม '+debtorStatus(bill.company,bill.code,bill.name||customer[4]).group:bill.hasAr?(current===0?'ตัดรับครบแล้ว':current<0?'เครดิตโน้ต':'ยังคงค้าง'):bill.sale>0&&paid>=bill.sale-.01?'รับชำระครบตามไฟล์':'ไม่พบบิลในชุดคงค้าง';
  details.push({...bill,name:bill.name||customer[kind==='monthly'?4:3],amount:moved?0:current,currentBalance:current,status});for(const event of bill.events)events.push({...event,name:bill.name||customer[kind==='monthly'?4:3]});
 }
 const cols=[{key:'company',label:'บริษัท'},{key:'code',label:'รหัสลูกค้า'},{key:'name',label:'ลูกค้า'},{key:'bill',label:'เลขบิล'},{key:'date',label:'วันที่บิล (Invoice Date)'},{key:'shipmentDate',label:'วันที่ส่งของ (Doc Date)'},{key:'deliveryNo',label:'SO/SS (Sale Order No)'},{key:'due',label:'ครบกำหนดหน้าบิล'},{key:'amount',label:'ยอดค้างในตาราง',type:'number'},{key:'currentBalance',label:'ยอดค้างตามบิล',type:'number'},{key:'status',label:'สถานะยอด'}];
 const eventCols=[...cols.slice(0,4),{key:'eventDate',label:'วันที่ตัดยอด'},{key:'receiptNo',label:'เลขที่รับชำระ'},{key:'eventType',label:'ประเภทการตัดยอด'},{key:'eventAmount',label:'ยอดตัดตามรายการ',type:'number'}];
 return {cols,rows:details,events:events.sort((a,b)=>String(a.eventDate).localeCompare(String(b.eventDate))),eventCols,name:'รายละเอียดลูกหนี้คงค้าง',note:'แสดงบิลรวมถึงยอดคงค้าง 0 และประวัติการตัดยอดตามไฟล์ · กลุ่ม 1–3 แยกไปสถานะลูกหนี้ ไม่ถือว่ารับชำระแล้ว · ไม่พบประวัติจะไม่สร้างวันที่ตัดยอดแทน'};
}
function reportDayDisplay(value){if(value===''||value===null||value===undefined||!Number.isFinite(Number(value)))return '—';return (Math.round(Number(value))||0).toLocaleString('th-TH')}
function reportIsAffiliate(row,kind){const name=reportNorm(row[kind==='monthly'?4:3]);return reportNorm(row[kind==='monthly'?5:4])===reportNorm('ในเครือ')||reportAffiliateCustomers.has(rrKey(row[1],row[2]))||['โปรเฟสอินดัสเทรียลกรุ๊ป','ทีเอ็นพีอินเตอร์เทรด'].some(n=>name.includes(n))}
const reportSourceCustomerData=rrCustomerData;
rrCustomerData=function(sales,master){
 const rows=reportSourceCustomerData(sales,master),saved=typeof reportData==='undefined'?null:reportData;
 const existing=new Map((saved?.credit?.rows||[]).map(r=>[rrKey(r[1],r[2]),r]));
 for(let row of rows){
  const key=rrKey(row.company,row.code),old=existing.get(key),edit=saved?.customerEdits?.[key];
  if(old)for(let [field,index]of [['type',4],['customerCredit',8],['terms',9],['paymentType',11]])if(!row[field]&&old[index])row[field]=old[index];
  if(reportAffiliateCustomers.has(key))row.type='ในเครือ';
  if(edit)for(let field of reportCustomerFields)if(Object.hasOwn(edit,field))row[field]=edit[field];
 }
 return rows;
};
function reportApplyCustomerEdits(snapshot,edits){
 const next=structuredClone(snapshot);next.customerEdits={...(next.customerEdits||{})};
 for(let [key,edit]of Object.entries(edits))next.customerEdits[key]={...(next.customerEdits[key]||{}),...edit};
 for(let row of next.credit.rows){
  const edit=edits[rrKey(row[1],row[2])];if(!edit)continue;
  for(let [field,index]of [['type',4],['credit',5],['customerCredit',8],['terms',9],['paymentType',11]])if(Object.hasOwn(edit,field))row[index]=edit[field];
  row[6]=rrCreditGroup(row[5]);row[12]=rrCreditGroup(row[8]);
  row[10]=row[8]===''?'ไม่ระบุเงื่อนไขลูกค้า':row[5]===''?'ไม่ระบุเครดิตเดิม':reportNorm(row[5])===reportNorm(row[8])?'ตรงกัน':'ต่างจากเครดิตเดิม';
 }
 for(let row of next.monthly.rows){const edit=edits[rrKey(row[1],row[2])];if(!edit)continue;if(Object.hasOwn(edit,'type'))row[5]=edit.type;if(Object.hasOwn(edit,'credit'))row[6]=edit.credit}
 return next;
}
const reportSourceBuild=rrBuild;
rrBuild=function(...args){const snapshot=reportSourceBuild(...args);return reportApplyCustomerEdits(snapshot,snapshot.customerEdits||{})};
function reportDetailCell(value,col,row,kind){
 return `<button class="report-cell-link" data-report-detail="${row}" data-report-key="${col.key}" aria-label="${esc(col.label)} · ดูรายละเอียด">${reportFormat(value,col)}</button>`;
}
function reportSourceDetail(rows,key,kind,snapshot=reportData){
 const source=snapshot.rawSources;
 if(!source||snapshot[kind].updatedAt&&snapshot[kind].updatedAt!==snapshot.updatedAt)return null;
 const selected=new Set(rows.map(r=>rrKey(r[1],r[2]))),index=Number(key.slice(1));
 const month=kind==='monthly'?snapshot.monthly.months.find(m=>m.sales===index||m.outstanding===index):null;
 const totals=kind==='monthly'?snapshot.monthly.columns.slice(-2).map(c=>c.key):[];
 const sales=kind==='monthly'&&(month?.sales===index||key===totals[0]);
 const days=kind==='monthly'&&index===7;
 if(!days&&!sales)return reportDebtDetail(rows,key,kind,snapshot);
 const visibleMonths=new Set(kind==='monthly'?(month?[month]:reportSelectedMonths()).map(m=>m.key):[]);
 const withinMonth=r=>!visibleMonths.size||visibleMonths.has(String(Number(r.date.slice(0,4))+543)+r.date.slice(5,7));
 const input=(source[days?'receipts':sales?'sales':'ar']?.rows||[]).filter(r=>selected.has(rrKey(r.company,r.code))&&(days||kind==='credit'||withinMonth(r))&&(days||sales||kind!=='monthly'||typeof debtorExcluded!=='function'||!debtorExcluded(r.company,r.code,r.name)));
 const cols=days?[{key:'bill',label:'เลขบิล'},{key:'date',label:'วันที่บิล'},{key:'receivedDate',label:'วันที่รับชำระ'},{key:'amount',label:'ยอดตัดรับ',type:'number'},{key:'days',label:'จำนวนวัน',type:'number',unit:'days'}]:[{key:'bill',label:'เลขบิล'},{key:'date',label:'วันที่บิล (Invoice Date)'},{key:'shipmentDate',label:'วันที่ส่งของ (Doc Date)'},{key:'deliveryNo',label:'SO/SS (Sale Order No)'},{key:'amount',label:sales?'ยอดขายรวม VAT':'ยอดค้างปัจจุบัน',type:'number'}];
 cols.unshift({key:'company',label:'บริษัท'},{key:'code',label:'รหัสลูกค้า'},{key:'name',label:'ลูกค้า'});
 const invoices=new Map([...(source.sales?.rows||[]),...(source.ar?.rows||[])].map(r=>[rrBillKey(r),r.date]));
 let excluded=0,weight=0,weightedDays=0;
 const detail=[];
 for(let r of input){
  if(days){
   if(r.received<=0){excluded++;continue}
   const date=invoices.get(rrBillKey(r))||r.date;if(!date)continue;
   const count=(Date.parse(r.receivedDate)-Date.parse(date))/86400000;
   weight+=r.received;weightedDays+=r.received*count;
   detail.push({...r,date,amount:r.received,days:count});
  }else{
   let amount=sales?r.amount:r.balance;
   if(!sales&&snapshot[kind].cashLink&&typeof reportReceiptReductions==='function'){
    const reductions=reportReceiptReductions({...snapshot[kind].cashLink,bills:[r]},typeof data==='undefined'?[]:data,typeof arInvoices==='undefined'?[]:arInvoices);
    amount=Math.round((amount-(reductions.get(rrKey(r.company,r.code))?.total||0))*100)/100;
   }
   detail.push({...r,amount});
  }
 }
 return {cols,rows:detail,average:weight?Math.round(weightedDays/weight*100)/100:null,name:days?'รายละเอียดจำนวนวันรับเงินจริง':sales?'รายละเอียดบิลขาย':'รายละเอียดลูกหนี้คงค้าง',note:days?`เฉลี่ยถ่วงน้ำหนัก ${reportDayDisplay(weight?weightedDays/weight:null)} วัน · Σ[ยอดตัดรับ × (วันรับ − วันบิล)] ÷ ยอดตัดรับรวม · ไม่รวมรายการตัดลด ${excluded} แถว · นับจากวันที่บิล รวมช่วงเครดิตแล้ว · ค่าติดลบหมายถึงรับก่อนวันที่บิล`:'ข้อมูลตามลูกค้าและเดือนที่เลือก · รวมยอดบิลเพียงครั้งเดียว'};
}
function reportOpenSourceDetail(rows,key,kind){
 const detail=reportSourceDetail(rows,key,kind);
 if(!detail){showCardDetail('รายละเอียดรายงาน','ยังไม่มีข้อมูลรายบิลของรายงานชุดนี้','<p>นำเข้าไฟล์ขายเชื่อ ลูกหนี้คงค้าง และรับชำระ แล้วคำนวณและยืนยันรายงานก่อนดูรายละเอียดรายบิล</p>');return}
 const pages={bills:0,events:0};let size=globalThis.CashTables?.getPageSize()||100;
 const table=(cols,rows,list)=>{const page=pages[list],selected=rows.slice(page*size,(page+1)*size);return `<div class="report-table-wrap"><table class="report-table" data-detail-table="${list}" data-page-size="${size}"><thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${selected.map(r=>`<tr>${cols.map(c=>`<td>${reportFormat(r[c.key],c)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}">ไม่มีรายการในข้อมูลที่นำเข้า</td></tr>`}</tbody></table></div>${rows.length>size?`<div class="source-pagination"><span>${page*size+1}–${Math.min((page+1)*size,rows.length)} จาก ${rows.length} รายการ · ส่งออกได้ครบทั้งหมด</span><button data-detail-list="${list}" data-detail-page="${page-1}" ${page===0?'disabled':''}>ก่อนหน้า</button><button data-detail-list="${list}" data-detail-page="${page+1}" ${(page+1)*size>=rows.length?'disabled':''}>ถัดไป</button></div>`:''}`};
 const cols=detail.events?[{key:'recordType',label:'รายการ'},...detail.cols,...detail.eventCols.filter(c=>!detail.cols.some(a=>a.key===c.key))]:detail.cols;
 const exportRows=detail.events?[...detail.rows.map(r=>({...r,recordType:'บิล'})),...detail.events.map(r=>({...r,recordType:'การตัดยอด'}))]:detail.rows;
 const open=()=>{const html=table(detail.cols,detail.rows,'bills')+(detail.events?'<h3>ประวัติการตัดยอด</h3>'+table(detail.eventCols,detail.events,'events'):'');showCardDetail(detail.name,detail.note,html,{kind:'ar',report:true,name:detail.name,cols,rows:exportRows});document.querySelectorAll('[data-detail-table]').forEach(table=>table.addEventListener('cash-page-size',event=>{size=event.detail.size;pages.bills=0;pages.events=0;open()}));document.querySelectorAll('[data-detail-page]').forEach(b=>b.onclick=()=>{pages[b.dataset.detailList]=Number(b.dataset.detailPage);open()})};open();
}
function reportBindDetails(rows,kind){
 document.querySelectorAll('[data-report-detail]').forEach(el=>el.onclick=()=>reportOpenSourceDetail(Number(el.dataset.reportDetail)<0?rows:[rows[Number(el.dataset.reportDetail)]],el.dataset.reportKey,kind));
 const edit=$('#report-edit');if(edit)edit.onclick=reportOpenEditor;
}
function reportPasteCustomerTerms(drafts,rowIndex,columnIndex,text){
 const next=structuredClone(drafts),lines=text.replace(/\r/g,'').replace(/\n$/,'').split('\n');
 lines.forEach((line,offset)=>{if(!next[rowIndex+offset])throw Error('จำนวนแถวเกินรายชื่อลูกค้าที่เปิดแก้ไข');line.split('\t').forEach((value,c)=>{const field=reportCustomerFields[columnIndex+c];if(!field)throw Error('จำนวนคอลัมน์เกินช่องที่แก้ไขได้');next[rowIndex+offset].values[field]=value.trim()})});
 return next;
}
function reportEditorTable(){
 return `<div class="report-table-wrap"><table class="report-table report-edit-table"><thead><tr><th>บริษัท</th><th>รหัสลูกค้า</th><th>ลูกค้า</th>${reportCustomerColumns.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${reportEditor.map((r,i)=>`<tr><td>${esc(r.company)}</td><td>${esc(r.code)}</td><td>${esc(r.name)}</td>${reportCustomerColumns.map((c,j)=>`<td><input class="${String(r.values[c.key]??'')!==String(r.original?.[c.key]??'')?'report-edited':''}" aria-label="${esc(c.label+' '+r.code)}" data-report-edit-row="${i}" data-report-edit-col="${j}" value="${esc(r.values[c.key]??'')}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function reportBindEditor(){
 document.querySelectorAll('[data-report-edit-row]').forEach(el=>{
  el.oninput=()=>{reportEditor[Number(el.dataset.reportEditRow)].values[reportCustomerFields[Number(el.dataset.reportEditCol)]]=el.value;el.classList.add('report-edited')};
  el.onpaste=e=>{const text=e.clipboardData.getData('text');if(!/[\t\n]/.test(text))return;e.preventDefault();try{reportEditor=reportPasteCustomerTerms(reportEditor,Number(el.dataset.reportEditRow),Number(el.dataset.reportEditCol),text);$('#report-editor-grid').innerHTML=reportEditorTable();reportBindEditor();document.querySelector(`[data-report-edit-row="${el.dataset.reportEditRow}"][data-report-edit-col="${el.dataset.reportEditCol}"]`)?.focus();$('#report-editor-error').textContent='วางข้อมูลแล้ว · กดบันทึกเพื่อใช้งาน'}catch(error){$('#report-editor-error').textContent=error.message}};
  el.onkeydown=e=>{if(e.key==='Enter'||['ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();const next=Number(el.dataset.reportEditRow)+(e.key==='ArrowUp'?-1:1);document.querySelector(`[data-report-edit-row="${next}"][data-report-edit-col="${el.dataset.reportEditCol}"]`)?.focus()}};
 });
}
function reportOpenEditor(){
 reportEditor=reportRows('credit').map(r=>{const values={type:r[4]??'',credit:r[5]??'',customerCredit:r[8]??'',terms:r[9]??'',paymentType:r[11]??''};return {company:r[1],code:r[2],name:r[3],values,original:{...values}}});
 if(!$('#report-editor'))document.body.insertAdjacentHTML('beforeend','<dialog id="report-editor"><div class="report-editor-head"><h2>แก้ไขเครดิตและเงื่อนไขลูกค้า</h2><button class="secondary" id="report-editor-cancel">ยกเลิก</button><button class="primary" id="report-editor-save">บันทึกการแก้ไข</button></div><p class="helper">พิมพ์หรือวางหลายช่องจาก Excel · Enter ลงแถวถัดไป · ช่องว่างไม่ถือเป็นเงินสด</p><div id="report-editor-error" role="status"></div><div id="report-editor-grid"></div></dialog>');
 $('#report-editor-grid').innerHTML=reportEditorTable();$('#report-editor-error').textContent='';reportBindEditor();
 $('#report-editor-cancel').onclick=()=>{$('#report-editor').close();reportEditor=null};
 $('#report-editor-save').onclick=()=>{try{const edits=Object.fromEntries(reportEditor.map(r=>[rrKey(r.company,r.code),Object.fromEntries(reportCustomerFields.filter(f=>String(r.values[f])!==String(r.original[f])).map(f=>[f,r.values[f]]))]).filter(([,edit])=>Object.keys(edit).length));if(Object.keys(edits).length){const next=reportApplyCustomerEdits(reportData,edits);reportApplySnapshot(next)}$('#report-editor').close();reportEditor=null}catch(error){$('#report-editor-error').textContent='ยังไม่บันทึก: '+error.message}};
 $('#report-editor').showModal();
}
