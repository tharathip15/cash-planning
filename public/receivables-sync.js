/* Source AR is derived from the saved report. Only user edits and real receipts persist twice. */
const sourceArStoreKey='profess-source-ar-edits-v1';
const sourceArEditable=['shipmentDate','deliveryNo','creditTerm','promiseDate','period','certainty','insured','defaultDate','letter1','letter2','letter3','claimDate','verifiedDate','contactDate','l2ReceivedDate','l2NegotiatedDate','lockDate','insurancePreparedDate','logs'];
let sourceArState={edits:{},archives:[]};try{const old=JSON.parse(localStorage.getItem(sourceArStoreKey)||'null');if(old?.edits)sourceArState=old}catch{}
let arShowAllOutstanding=true;
let sourceArIncludeAffiliates=false;
let sourceArPage=0,sourceArTotal=0;
let sourceArTab='all';
let sourcePageSize=50;const sourceIncomePages={};
try{const size=localStorage.getItem('cash-table-page-size');sourcePageSize=size==='all'?Number.MAX_SAFE_INTEGER:[25,50,100,250].includes(Number(size))?Number(size):50}catch{}
function sourceSetPageSize(size){sourcePageSize=size;sourceArPage=0;for(const key of Object.keys(sourceIncomePages))sourceIncomePages[key]=0;if(view==='ar-plan')arRender();else render()}
function sourceBillKey(row){return debtorCompany(row.company||row.sourceCompany)+'|'+String(row.code||row.sourceCustomerCode||'').trim().toUpperCase()+'|'+String(row.bill||row.billNo||'').trim().toUpperCase()}
function sourceReceivableModel(snapshot,existing,edits={},cash=[]){
 const raw=snapshot?.rawSources?.ar;if(!raw?.rows)return null;
 const existingBySource=new Map();for(const invoice of existing)if(invoice.sourceCompany&&invoice.sourceCustomerCode&&!existingBySource.has(sourceBillKey(invoice)))existingBySource.set(sourceBillKey(invoice),invoice);
 const sales=new Map(),customers=new Map((snapshot.credit?.rows||[]).map(r=>[debtorIdentity(r[1],r[2],r[3]).key,r]));
 for(const row of snapshot.rawSources.sales?.rows||[]){const key=sourceBillKey(row),old=sales.get(key);if(old){if(old.date!==row.date)throw Error('บิลมีวันที่ต่างกัน '+row.bill);old.amount+=Number(row.amount)||0}else sales.set(key,{...row,amount:Number(row.amount)||0})}
 const positives=raw.rows.filter(r=>Number(r.balance)>0),seen=new Set(),used=new Set(),invoices=[];
 for(const row of positives){
  const key=sourceBillKey(row);if(seen.has(key))throw Error('ยอดค้างซ้ำเลขบิล '+row.bill);seen.add(key);
  const sale=sales.get(key),customer=customers.get(debtorIdentity(row.company,row.code,row.name).key),name=row.name||sale?.name||customer?.[3]||row.code;
  let previous=existingBySource.get(key);
  if(!previous){const candidates=existing.filter(i=>!i.sourceManaged&&!i.sourceCompany&&String(i.billNo).trim().toUpperCase()===String(row.bill).trim().toUpperCase()&&debtorName(i.customer)===debtorName(name));if(candidates.length===1&&positives.filter(r=>String(r.bill).trim().toUpperCase()===String(row.bill).trim().toUpperCase()&&debtorName(r.name)===debtorName(name)).length===1)previous=candidates[0]}
  if(previous)used.add(previous.id);
  const known=Number(sale?.amount)>0?Number(sale.amount):Number(row.invoiceAmount)>0?Number(row.invoiceAmount):null,gross=known??Number(row.balance);
  if(gross+.01<Number(row.balance))throw Error('ยอดค้างมากกว่ายอดบิล '+row.bill);
  const defaults={shipmentDate:sale?.shipmentDate||'',deliveryNo:sale?.deliveryNo||'',creditTerm:String(sale?.credit??customer?.[5]??''),promiseDate:'',period:'unset',certainty:'uncertain',insured:'unknown',logs:[]};
  const id=previous?.id||'source-ar:'+encodeURIComponent(key),changes=edits[id]||{},initial={};
  if(previous&&!previous.sourceManaged)for(const field of sourceArEditable)if(previous[field]!==undefined&&previous[field]!==''&&previous[field]!==null)initial[field]=previous[field];
  invoices.push({...defaults,...initial,...changes,id,billNo:row.bill,customer:name,sourceCompany:row.company,sourceCustomerCode:row.code,amount:Math.round(gross*100)/100,priorPaid:Math.round((gross-Number(row.balance))*100)/100,dueDate:row.due||sale?.due||'',sourceManaged:true,sourceInvoiceKey:key,sourceDocDate:sale?.invoiceDate||row.invoiceDate||row.date,sourceSnapshotAsOf:row.snapshotAsOf||raw.asOf||snapshot.asOf,sourceOutstanding:Number(row.balance),sourceInvoiceTotalKnown:known!==null,sourceDefaults:defaults,sourceArchived:false});
 }
 for(const old of existing)if(old.sourceManaged&&!used.has(old.id)&&!seen.has(sourceBillKey(old))&&(cash.some(x=>x.arInvoiceId===old.id&&x.certainty==='received')||old.logs?.length))invoices.push({...old,sourceArchived:true,sourceOutstanding:0,priorPaid:old.amount,sourceSnapshotAsOf:raw.asOf||snapshot.asOf});
 return {invoices:[...existing.filter(i=>!i.sourceManaged&&!used.has(i.id)),...invoices],adjustments:raw.rows.filter(r=>Number(r.balance)<=0),count:positives.length};
}
function persistSourceAr(invoices){
 const edits={},archives=[];
 for(const row of invoices.filter(i=>i.sourceManaged)){
  const changed={};for(const field of sourceArEditable)if(JSON.stringify(row[field]??'')!==JSON.stringify(row.sourceDefaults?.[field]??''))changed[field]=row[field]??'';
  if(Object.keys(changed).length)edits[row.id]=changed;
  if(row.sourceArchived)archives.push({id:row.id,sourceManaged:true,sourceArchived:true,sourceCompany:row.sourceCompany,sourceCustomerCode:row.sourceCustomerCode,billNo:row.billNo,customer:row.customer,amount:row.amount,priorPaid:row.amount,sourceDocDate:row.sourceDocDate,dueDate:row.dueDate,sourceSnapshotAsOf:row.sourceSnapshotAsOf,sourceOutstanding:0,...changed});
 }
 const next={edits,archives},previous=localStorage.getItem('profess-ar-v1'),old=localStorage.getItem(sourceArStoreKey);
 try{localStorage.setItem('profess-ar-v1',JSON.stringify(invoices.filter(i=>!i.sourceManaged)));localStorage.setItem(sourceArStoreKey,JSON.stringify(next));sourceArState=next;return true}catch(error){for(const [key,value]of [['profess-ar-v1',previous],[sourceArStoreKey,old]])try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}catch{}$('#save-message').textContent='บันทึกข้อมูลลูกหนี้ไม่สำเร็จ: '+error.message;return false}
}
function syncSourceReceivables(snapshot=reportData){
 if(!window.cashReady)return;
 try{const saved=JSON.parse(localStorage.getItem(sourceArStoreKey)||'null');if(saved?.edits)sourceArState=saved}catch{}
 const all=[...arInvoices,...sourceArState.archives.filter(i=>!arInvoices.some(x=>x.id===i.id))],model=sourceReceivableModel(snapshot,all,sourceArState.edits,data);if(!model)return;
 arInvoices=model.invoices;
 // Preserve drafts, transferring only exact source duplicates into their linked row.
 for(const [id,draft]of Object.entries(arPending)){
  const target=arInvoices.find(i=>i.sourceManaged&&draft.sourceCompany&&draft.sourceCustomerCode&&sourceBillKey(i)===sourceBillKey(draft));if(!target)continue;
  if(id===String(target.id)){for(const field of ['amount','priorPaid','dueDate','sourceCompany','sourceCustomerCode','sourceSnapshotAsOf','sourceManaged','sourceDefaults'])draft[field]=target[field];continue}
  if(Math.abs(Number(draft.amount)-target.amount)<.01&&Math.abs(Number(draft.priorPaid)-target.priorPaid)<.01){for(const field of sourceArEditable)if(draft[field]!==undefined&&draft[field]!==''&&draft[field]!==null)target[field]=draft[field];delete arPending[id]}
 }
 arStorePending();syncAllArPlans();
}
function sourceInvoiceLocked(field,row){return !!row.sourceManaged&&['sourceCompany','sourceCustomerCode','billNo','sourceDocDate','customer','amount','priorPaid','dueDate'].includes(field)}
function sourceInvoiceVisible(row){return sourceArIncludeAffiliates||typeof reportIsAffiliate!=='function'||!reportIsAffiliate([0,row.sourceCompany,row.sourceCustomerCode,row.customer,''],'credit')}
function sourceTrackingVisible(row){return arOutstanding(row)>0&&(sourceArTab==='unplanned'?!row.promiseDate:sourceArTab==='scheduled'?!!row.promiseDate:true)}
function sourceReceiptIdentity(row){
 const invoice=row.arInvoiceId?arInvoices.find(item=>item.id===row.arInvoiceId):null;
 const company=row.sourceCompany||invoice?.sourceCompany||row.company,code=row.sourceCustomerCode||invoice?.sourceCustomerCode||row.code,bill=row.sourceBillNo||invoice?.billNo||row.bill;
 return company&&code&&bill?sourceBillKey({company,code,bill}):'';
}
function sourceReceiptMatch(cash,snapshot=reportData,cashRows=data){
 const key=sourceReceiptIdentity(cash),date=cash.receipt?.actualDate||cash.date,value=Number(cash.actualAmount??cash.receipt?.actualAmount??cash.amount),reference=cash.receipt?.receiptNo||'';
 if(!key)return {status:'unlinked',label:'ยังไม่เชื่อมเลขบิล'};
 const source=(snapshot?.rawSources?.receipts?.rows||[]).filter(row=>Number(row.received)>0&&sourceReceiptIdentity(row)===key);
 const candidates=source.filter(row=>row.receivedDate===date&&Math.abs(Number(row.received)-value)<.005&&(!reference||!row.receiptNo||row.receiptNo===reference));
 const confirmations=cashRows.filter(row=>row.type==='in'&&row.certainty==='received'&&sourceReceiptIdentity(row)===key&&(row.receipt?.actualDate||row.date)===date&&Math.abs(Number(row.actualAmount??row.receipt?.actualAmount??row.amount)-value)<.005&&(!reference||!row.receipt?.receiptNo||row.receipt.receiptNo===reference));
 if(candidates.length===1&&confirmations.length===1)return {status:'matched',label:'ตรงกับรายงานรับชำระ',source:candidates[0]};
 if(candidates.length)return {status:'review',label:'พบรายการซ้ำ ต้องตรวจสอบ'};
 return source.length?{status:'review',label:'ยอดหรือวันที่ไม่ตรง ต้องตรวจสอบ'}:{status:'waiting',label:'ยืนยันเงินเข้าแล้ว · รอรายงานรับชำระ'};
}
function sourceReceiptBadge(row){if(row.certainty!=='received')return '';const result=sourceReceiptMatch(row);return `<small class="receipt-match-badge" data-match-status="${result.status}">${esc(result.label)}</small>`}
function sourceReconciliationImportNote(snapshot){
 const confirmed=data.filter(row=>row.type==='in'&&row.certainty==='received'&&row.arInvoiceId),results=confirmed.map(row=>sourceReceiptMatch(row,snapshot));if(!results.length)return '';
 return `<div class="notice"><b>ตรวจเทียบกับเงินเข้าที่เคยยืนยันจาก Statement</b><p>ตรงกับรายงาน ${results.filter(row=>row.status==='matched').length} รายการ · ต้องตรวจสอบ ${results.filter(row=>row.status==='review').length} รายการ · ยังไม่พบในรายงาน ${results.filter(row=>row.status==='waiting').length} รายการ</p>แสดงผลตรวจเทียบเท่านั้น ไม่สร้างรายการรับหรือหักยอดซ้ำ · ดูรายละเอียดในติดตามหนี้ → รับชำระ / ตรวจเทียบ</div>`;
}
function sourceReconciliationRows(snapshot=reportData,cashRows=data){
 const rows=[],matched=new Set(),within=date=>date&&date>=rangeStart&&date<=rangeEnd;
 for(const cash of cashRows.filter(row=>row.type==='in'&&row.certainty==='received'&&within(row.receipt?.actualDate||row.date))){
  const match=sourceReceiptMatch(cash,snapshot,cashRows),invoice=arInvoices.find(item=>item.id===cash.arInvoiceId);
  if(match.source)matched.add(match.source);
  rows.push({company:cash.sourceCompany||invoice?.sourceCompany||'',customer:cash.party||invoice?.customer||'',bill:cash.sourceBillNo||invoice?.billNo||'',date:cash.receipt?.actualDate||cash.date,amount:Number(cash.actualAmount??cash.receipt?.actualAmount??cash.amount),reference:cash.receipt?.receiptNo||match.source?.receiptNo||'',status:match.status,statusLabel:match.label,origin:'ยืนยันจาก Statement'});
 }
 for(const row of snapshot?.rawSources?.receipts?.rows||[])if(within(row.receivedDate)&&!matched.has(row))rows.push({company:row.company,customer:row.name||'',bill:row.bill,date:row.receivedDate,amount:Number(row.received),reference:row.receiptNo||'',status:Number(row.received)<0?'adjustment':'file_only',statusLabel:Number(row.received)<0?'รายการลดหนี้ · ไม่ใช่เงินเข้า':'พบในรายงาน · ยังไม่ยืนยัน Statement',origin:'ไฟล์รายงานรับชำระ'});
 return rows.filter(row=>sourceInvoiceVisible({sourceCompany:row.company,customer:row.customer})&&String([row.company,row.customer,row.bill,row.reference,row.statusLabel].join(' ')).toLocaleLowerCase('th').includes(String(typeof arSearch==='undefined'?'':arSearch).trim().toLocaleLowerCase('th'))).sort((a,b)=>b.date.localeCompare(a.date));
}
function sourceReconciliationSpec(){return {kind:'ar',report:true,name:'ตรวจเทียบรับชำระ',cols:[{key:'company',label:'บริษัท'},{key:'customer',label:'ลูกค้า'},{key:'bill',label:'เลขบิล'},{key:'date',label:'วันที่รับชำระ'},{key:'reference',label:'เลขที่รับชำระ'},{key:'amount',label:'จำนวนเงิน',type:'number'},{key:'origin',label:'ที่มา'},{key:'statusLabel',label:'ผลตรวจเทียบ'}],rows:sourceReconciliationRows()}}
function sourceReconciliationHTML(){
 const spec=sourceReconciliationSpec(),rows=spec.rows,page=Math.min(sourceIncomePages.reconciliation||0,Math.max(0,Math.ceil(rows.length/sourcePageSize)-1));sourceIncomePages.reconciliation=page;
 return `<section class="panel receipt-reconciliation"><div class="panelhead"><h2>รับชำระ / ตรวจเทียบ</h2><small>${rows.length} รายการในช่วงที่เลือก</small></div><p class="receipt-source-note">ตรวจเทียบยอดที่ยืนยันจาก Statement กับไฟล์รายงานรับชำระ ด้วยบริษัท รหัสลูกค้า เลขบิล วันที่ และยอดเงิน · รายการซ้ำหรือไม่ตรงต้องตรวจสอบ · ไฟล์รับชำระไม่ยืนยันเงินเข้าจาก Statement ให้อัตโนมัติ และไม่หักยอดซ้ำ</p><div class="scroll"><table class="report-table"><thead><tr>${spec.cols.map(col=>`<th>${col.label}</th>`).join('')}</tr></thead><tbody>${rows.slice(page*sourcePageSize,(page+1)*sourcePageSize).map(row=>`<tr>${spec.cols.map(col=>`<td ${col.key==='statusLabel'?`data-match-status="${row.status}"`:''}>${reportFormat(row[col.key],col)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${spec.cols.length}" class="empty">ไม่มีรายการในช่วงวันที่ที่เลือก · เปลี่ยนช่วงวันที่ด้านบนเพื่อดูประวัติรับชำระ</td></tr>`}</tbody></table></div>${sourcePager(rows.length,page,'income-reconciliation')}</section>`;
}
function sourceTrackingTabs(){
 const open=arInvoices.filter(row=>arOutstanding(row)>0&&sourceInvoiceVisible(row)),tabs=[['all','ลูกหนี้คงค้าง',open.length],['unplanned','รอนัดชำระ',open.filter(row=>!row.promiseDate).length],['scheduled','นัดแล้ว',open.filter(row=>row.promiseDate).length],['reconciliation','รับชำระ / ตรวจเทียบ',null]];
 return `<div class="tracking-tabs" role="tablist" aria-label="ขั้นตอนติดตามลูกหนี้">${tabs.map(([key,label,count])=>`<button type="button" role="tab" data-tracking-tab="${key}" aria-selected="${sourceArTab===key}">${label}${count===null?'':` <span>${count}</span>`}</button>`).join('')}</div><p class="tracking-flow-note">กำหนดวันนัดในติดตามหนี้ → ไปรายการรับทั้งหมดเพื่อตรวจ Statement → ยืนยันเงินเข้า → ตรวจเทียบกับรายงานรับชำระ</p>`;
}
function sourceArStatus(row){const current=debtorStatus(row.sourceCompany,row.sourceCustomerCode,row.customer);return current.group?current.group+' · '+debtorGroups[current.group]:'ยังไม่จัดกลุ่ม'}
function sourceArOverview(){
 const rows=arInvoices.filter(i=>arOutstanding(i)>0&&sourceInvoiceVisible(i)),source=rows.filter(i=>i.sourceManaged),noPromise=source.filter(i=>!i.promiseDate),sum=items=>items.reduce((n,i)=>n+arOutstanding(i),0),credits=reportData?.rawSources?.ar?.rows.filter(r=>Number(r.balance)<0&&sourceInvoiceVisible({sourceCompany:r.company,sourceCustomerCode:r.code,customer:r.name}))||[];
 return `<div class="cards ar-source-cards"><div class="card"><label>บิลคงค้างในระบบ</label><div class="value">${rows.length.toLocaleString('th-TH')}</div><small>จากรายงาน ${source.length} บิล</small></div><div class="card"><label>ยอดบิลค้างรับ</label><div class="value">${money(sum(rows))}</div><small>ยังไม่หักเครดิตโน้ตที่แสดงแยก</small></div><div class="card"><label>บิลค้างที่ยังไม่ระบุวันนัดรับเงิน</label><div class="value">${money(sum(noPromise))}</div><small>${noPromise.length} บิล · อาจเกินกำหนดแล้ว แต่ยังไม่ได้บันทึกวันนัดจากลูกค้า</small></div><div class="card"><label>เครดิตโน้ตในชุดคงค้าง</label><div class="value">${money(credits.reduce((n,r)=>n+Number(r.balance),0))}</div><small>${credits.length} รายการ · รวมในรายงานยอดค้างสุทธิ</small></div></div><div class="source-ar-controls"><label><input id="ar-show-all" type="checkbox" ${arShowAllOutstanding?'checked':''}> แสดงบิลคงค้างทั้งหมด ไม่จำกัดช่วงวันนัด</label><label><input id="source-affiliates" type="checkbox" ${sourceArIncludeAffiliates?'checked':''}> รวมลูกค้าในเครือ</label><button class="secondary" id="ar-sync-reports">ตรวจการเชื่อมจากรายงาน</button><button type="button" class="secondary" data-open-income-plan>ไปรายการรับทั้งหมด</button><span>บันทึกวันนัดแล้วบิลจะไปรายการรับทั้งหมด · ยืนยันจาก Statement แล้วตรวจเทียบรายงานรับชำระ</span></div>`;
}
function sourceIncomeRows(){
 return data.filter(x=>x.type==='in'&&!x.arClosed&&(x.certainty==='received'?x.date>=rangeStart&&x.date<=rangeEnd:x.sourceManaged?sourceInvoiceVisible({sourceCompany:x.sourceCompany,sourceCustomerCode:x.sourceCustomerCode,customer:x.party})&&!!x.date&&x.date<=rangeEnd:x.date>=rangeStart&&x.date<=rangeEnd));
}
function sourceIncomeDateContext(row){
 if(!row.arInvoiceId||row.certainty==='received')return '';
 const invoice=arInvoices.find(item=>item.id===row.arInvoiceId),due=row.sourceDueDate||invoice?.dueDate||'';
 if(!due)return '<small class="income-date-context">ยังไม่มีข้อมูลวันครบกำหนดหน้าบิล</small>';
 const today=bangkokToday(),days=Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(due+'T00:00:00Z'))/86400000),status=days>0?'เกินกำหนด '+days+' วัน':days===0?'ครบกำหนดวันนี้':'ยังไม่ถึงกำหนด';
 return `<small class="income-date-context ${days>0?'is-overdue':''}"><b>ครบกำหนดหน้าบิล ${esc(arDate(due))}</b>${status}</small>`;
}
function sourceSettlementRows(invoice){
 if(!invoice?.sourceCompany||!invoice.sourceCustomerCode||!reportData?.rawSources||typeof reportBillIndex!=='function')return [];
 const bill=reportBillIndex(reportData).get(reportSourceKey({company:invoice.sourceCompany,code:invoice.sourceCustomerCode,bill:invoice.billNo}));
 return (bill?.events||[]).map(event=>({company:debtorCompany(invoice.sourceCompany),customer:invoice.customer,bill:invoice.billNo,date:event.eventDate||'',receiptNo:event.receiptNo||'',type:event.eventType,amount:Number(event.eventAmount)||0})).sort((a,b)=>a.date.localeCompare(b.date));
}
function sourceSettlementSummary(invoice){
 const rows=sourceSettlementRows(invoice),received=rows.filter(row=>row.amount>0).reduce((sum,row)=>sum+row.amount,0);
 return `<div class="receipt-source-note"><b>เชื่อมประวัติรับชำระตามบิล</b><br>จับคู่บริษัท + รหัสลูกค้า + เลขบิล · พบ ${rows.length} รายการ · ยอดรับชำระ ${money(received)} บาท<br>ยอดที่รวมในชุดลูกหนี้คงค้างแล้วจะไม่หักซ้ำ · รายการลดหนี้แสดงแยกจากเงินรับจริง <button type="button" class="secondary" data-ar-settlements="${esc(invoice.id)}">ดูรับชำระตามบิล</button></div>`;
}
function openSourceSettlements(id){
 const invoice=arInvoices.find(item=>String(item.id)===String(id));if(!invoice)return;
 const rows=sourceSettlementRows(invoice),cols=[{key:'company',label:'บริษัท'},{key:'customer',label:'ลูกค้า'},{key:'bill',label:'เลขบิล'},{key:'date',label:'วันที่รับชำระ/ตัดยอด'},{key:'receiptNo',label:'เลขที่รับชำระ'},{key:'type',label:'ประเภท'},{key:'amount',label:'ยอดตามรายการ',type:'number'}];
 const note='ยอดรับจากไฟล์ที่รวมในชุดลูกหนี้คงค้างแล้วจะไม่หักซ้ำ · รับเงินจริงที่ยืนยันหลังวันที่ชุดคงค้างจึงนำมาปรับยอดเพิ่ม · ยอดตัดลดเดิมอาจรวมใบลดหนี้';
 showCardDetail('รับชำระ · บิล '+invoice.billNo,invoice.customer,`<p class="receipt-source-note">${note}</p><div class="scroll"><table><thead><tr>${cols.map(col=>`<th>${col.label}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${cols.map(col=>`<td>${reportFormat(row[col.key],col)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${cols.length}">ไม่พบประวัติรับชำระรายบิลในไฟล์ที่นำเข้า · ยอดค้างยังอ้างอิงรายงานลูกหนี้คงค้าง</td></tr>`}</tbody></table></div>`,{kind:'ar',report:true,name:'รับชำระ-'+invoice.billNo,cols,rows});
}
function bindSourceSettlementButtons(){document.querySelectorAll('[data-ar-settlements]').forEach(button=>button.onclick=()=>openSourceSettlements(button.dataset.arSettlements))}
function sourcePager(total,page,key){return total<=sourcePageSize?'':`<div class="source-pagination"><span>แสดง ${page*sourcePageSize+1}–${Math.min((page+1)*sourcePageSize,total)} จาก ${total.toLocaleString('th-TH')} รายการ</span><button class="secondary" data-source-page="${key}" data-page="${page-1}" ${page===0?'disabled':''}>ก่อนหน้า</button><button class="secondary" data-source-page="${key}" data-page="${page+1}" ${(page+1)*sourcePageSize>=total?'disabled':''}>ถัดไป</button></div>`}
function sourcePagedArRows(rows){sourceArTotal=rows.length;sourceArPage=Math.min(sourceArPage,Math.max(0,Math.ceil(rows.length/sourcePageSize)-1));return rows.slice(sourceArPage*sourcePageSize,(sourceArPage+1)*sourcePageSize)}
function sourceIncomeTable(rows){
 const waiting=arInvoices.filter(invoice=>arOutstanding(invoice)>0&&!invoice.promiseDate&&sourceInvoiceVisible(invoice));
 rows=rows.filter(row=>row.date);
 const notice=`<div class="income-workflow-note"><b>รายการรับทั้งหมด · ตรวจยอดเข้าตามวันนัด</b><p>เช็ก Statement → ยืนยันเงินเข้า → ลดหนี้บิลเดิม → ตรวจเทียบรายงานรับชำระ</p>${waiting.length?`<button type="button" class="secondary" data-open-unplanned>มี ${waiting.length} บิลรอนัด · ไปติดตามหนี้</button>`:''}</div>`;
 const groups=[['นัดชำระก่อนช่วงที่เลือก (ยังค้าง)',rows.filter(x=>x.certainty!=='received'&&x.date&&x.date<rangeStart),'เลยวันที่นัดรับเงินแล้วและยังมีเงินค้าง · วันนัดรับเงินเป็นคนละวันที่กับวันครบกำหนดหน้าบิล'],['ตามวันนัดรับเงิน',rows.filter(x=>x.certainty!=='received'&&x.date&&x.date>=rangeStart),'จัดตามวันที่ลูกค้านัดชำระ · ดูวันครบกำหนดหน้าบิลและสถานะเกินกำหนดใต้ช่องวันที่'],['ยังไม่ระบุวันนัดรับเงิน',rows.filter(x=>x.certainty!=='received'&&!x.date),'บิลยังค้าง แต่ยังไม่ได้บันทึกวันที่ลูกค้าตกลงจะจ่าย บางบิลอาจเกินกำหนดแล้ว · ดูวันครบกำหนดหน้าบิลใต้ช่องวันที่ · ยอดกลุ่มนี้ยังไม่รวมแผนเงินสดตามวัน จนกว่าจะกำหนดวันนัด'],['รับชำระแล้ว',rows.filter(x=>x.certainty==='received'),'วันที่ในกลุ่มนี้คือวันที่ยืนยันรับเงินจริง']];
 return notice+(groups.map(([title,items,note],key)=>{if(!items.length)return '';const page=Math.min(sourceIncomePages[key]||0,Math.max(0,Math.ceil(items.length/sourcePageSize)-1));sourceIncomePages[key]=page;const selected=items.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.party||'').localeCompare(b.party||'','th')).slice(page*sourcePageSize,(page+1)*sourcePageSize);return `<section class="income-date-group"><div class="income-group-head"><h3>${title}</h3><span>${items.length} รายการ · ${money(items.reduce((n,x)=>n+amount(x),0))} บาท</span></div><p class="income-group-note">${note}</p>${sheetTable(selected)}${sourcePager(items.length,page,'income-'+key)}</section>`}).join('')||sheetTable([]));
}
function bindSourceReceivables(){
 bindSourceSettlementButtons();
 document.querySelectorAll('[data-tracking-tab]').forEach(button=>button.onclick=()=>{sourceArTab=button.dataset.trackingTab;sourceArPage=0;arRender()});
 document.querySelectorAll('[data-open-unplanned]').forEach(button=>button.onclick=()=>{view='ar-plan';sourceArTab='unplanned';sourceArPage=0;arShowAllOutstanding=true;arSearch='';render()});
 document.querySelectorAll('[data-open-income-plan]').forEach(button=>button.onclick=()=>{view='income';render()});
 document.querySelectorAll('.ar-source-cards .card').forEach((card,index)=>bindCard(card,()=>{
  const invoices=arInvoices.filter(i=>arOutstanding(i)>0&&sourceInvoiceVisible(i)&&(index!==2||i.sourceManaged&&!i.promiseDate));
  const credits=reportData?.rawSources?.ar?.rows.filter(r=>Number(r.balance)<0&&sourceInvoiceVisible({sourceCompany:r.company,sourceCustomerCode:r.code,customer:r.name}))||[];
  const rows=index===3?credits.map(r=>({company:debtorCompany(r.company),customer:r.name,bill:r.bill,due:r.due||'',promise:'',balance:r.balance})):invoices.map(i=>({company:debtorCompany(i.sourceCompany),customer:i.customer,bill:i.billNo,due:i.dueDate||'',promise:i.promiseDate||'',balance:arOutstanding(i)}));
  const cols=[{key:'company',label:'บริษัท'},{key:'customer',label:'ลูกค้า'},{key:'bill',label:'เลขบิล'},{key:'due',label:'ครบกำหนด'},{key:'promise',label:'วันนัดชำระ'},{key:'balance',label:'ยอดคงค้าง',type:'number'}],spec={kind:'ar',report:true,name:['บิลคงค้าง','ยอดบิลค้างรับ','ยังไม่นัดชำระ','เครดิตโน้ต'][index],cols,rows};
  showCardDetail(spec.name,rows.length+' รายการ',`<div class="scroll"><table><thead><tr>${cols.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${cols.map(c=>`<td>${reportFormat(r[c.key],c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,spec);
 }));
 if($('#ar-show-all'))$('#ar-show-all').onchange=e=>{arShowAllOutstanding=e.target.checked;arRender()};
 if($('#ar-sync-reports'))$('#ar-sync-reports').onclick=async()=>{await loadReports();syncSourceReceivables();arRender()};
 if($('#source-affiliates'))$('#source-affiliates').onchange=e=>{sourceArIncludeAffiliates=e.target.checked;render()};
 document.querySelectorAll('[data-source-page]').forEach(b=>b.onclick=()=>{if(b.dataset.sourcePage==='ar'){sourceArPage=Number(b.dataset.page);arRender()}else{sourceIncomePages[b.dataset.sourcePage.slice(7)]=Number(b.dataset.page);render()}});
 document.querySelectorAll('[data-income-invoice]').forEach(b=>b.onclick=()=>{const invoice=arInvoices.find(i=>i.id===b.dataset.incomeInvoice);if(!invoice)return;if(arOutstanding(invoice)<=0){openSourceSettlements(invoice.id);return}view='ar-plan';sourceArTab='all';arShowAllOutstanding=true;sourceArPage=0;arSearch=invoice.billNo;render();document.querySelector(`[data-ar-sheet-id="${invoice.id}"][data-ar-sheet-key="promiseDate"]`)?.focus()});
}

// Boot: load the existing saved source so earlier imports connect without reuploading.
loadReports().then(()=>{if(reportData?.rawSources?.ar){syncSourceReceivables();if(['overview','calendar','income','ar-plan'].includes(view))render()}});
