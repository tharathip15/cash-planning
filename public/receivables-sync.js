/* Source AR is derived from the saved report. Only user edits and real receipts persist twice. */
const sourceArStoreKey='profess-source-ar-edits-v1';
const sourceArEditable=['shipmentDate','deliveryNo','creditTerm','promiseDate','period','certainty','insured','defaultDate','letter1','letter2','letter3','claimDate','verifiedDate','contactDate','l2ReceivedDate','l2NegotiatedDate','lockDate','insurancePreparedDate','logs'];
let sourceArState={edits:{},archives:[]};try{const old=JSON.parse(localStorage.getItem(sourceArStoreKey)||'null');if(old?.edits)sourceArState=old}catch{}
let arShowAllOutstanding=true;
let sourceArIncludeAffiliates=false;
let sourceArPage=0,sourceArTotal=0;
const sourcePageSize=50,sourceIncomePages={};
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
  invoices.push({...defaults,...initial,...changes,id,billNo:row.bill,customer:name,sourceCompany:row.company,sourceCustomerCode:row.code,amount:Math.round(gross*100)/100,priorPaid:Math.round((gross-Number(row.balance))*100)/100,dueDate:row.due||sale?.due||'',sourceManaged:true,sourceInvoiceKey:key,sourceDocDate:row.date,sourceSnapshotAsOf:raw.asOf||snapshot.asOf,sourceOutstanding:Number(row.balance),sourceInvoiceTotalKnown:known!==null,sourceDefaults:defaults,sourceArchived:false});
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
function sourceInvoiceLocked(field,row){return !!row.sourceManaged&&['sourceCompany','sourceCustomerCode','billNo','customer','amount','priorPaid','dueDate'].includes(field)}
function sourceInvoiceVisible(row){return sourceArIncludeAffiliates||typeof reportIsAffiliate!=='function'||!reportIsAffiliate([0,row.sourceCompany,row.sourceCustomerCode,row.customer,''],'credit')}
function sourceArStatus(row){const current=debtorStatus(row.sourceCompany,row.sourceCustomerCode,row.customer);return current.group?current.group+' · '+debtorGroups[current.group]:'ยังไม่จัดกลุ่ม'}
function sourceArOverview(){
 const rows=arInvoices.filter(i=>arOutstanding(i)>0&&sourceInvoiceVisible(i)),source=rows.filter(i=>i.sourceManaged),noPromise=source.filter(i=>!i.promiseDate),sum=items=>items.reduce((n,i)=>n+arOutstanding(i),0),credits=reportData?.rawSources?.ar?.rows.filter(r=>Number(r.balance)<0&&sourceInvoiceVisible({sourceCompany:r.company,sourceCustomerCode:r.code,customer:r.name}))||[];
 return `<div class="cards ar-source-cards"><div class="card"><label>บิลคงค้างในระบบ</label><div class="value">${rows.length.toLocaleString('th-TH')}</div><small>จากรายงาน ${source.length} บิล</small></div><div class="card"><label>ยอดบิลค้างรับ</label><div class="value">${money(sum(rows))}</div><small>ยังไม่หักเครดิตโน้ตที่แสดงแยก</small></div><div class="card"><label>ยังไม่กำหนดวันนัดชำระ</label><div class="value">${money(sum(noPromise))}</div><small>${noPromise.length} บิล · แสดงในรายการรับแยกกลุ่ม</small></div><div class="card"><label>เครดิตโน้ตในชุดคงค้าง</label><div class="value">${money(credits.reduce((n,r)=>n+Number(r.balance),0))}</div><small>${credits.length} รายการ · รวมในรายงานยอดค้างสุทธิ</small></div></div><div class="source-ar-controls"><label><input id="ar-show-all" type="checkbox" ${arShowAllOutstanding?'checked':''}> แสดงบิลคงค้างทั้งหมด ไม่จำกัดช่วงวันนัด</label><label><input id="source-affiliates" type="checkbox" ${sourceArIncludeAffiliates?'checked':''}> รวมลูกค้าในเครือ</label><button class="secondary" id="ar-sync-reports">ตรวจการเชื่อมจากรายงาน</button><span>ข้อมูลที่ไม่มีในไฟล์เว้นว่างไว้ · บันทึกวันนัดเพื่อจัดแผนรับ</span></div>`;
}
function sourceIncomeRows(){
 return data.filter(x=>x.type==='in'&&!x.arClosed&&(x.certainty==='received'?x.date>=rangeStart&&x.date<=rangeEnd:x.sourceManaged?sourceInvoiceVisible({sourceCompany:x.sourceCompany,sourceCustomerCode:x.sourceCustomerCode,customer:x.party})&&(!x.date||x.date<=rangeEnd):x.date>=rangeStart&&x.date<=rangeEnd));
}
function sourcePager(total,page,key){return total<=sourcePageSize?'':`<div class="source-pagination"><span>แสดง ${page*sourcePageSize+1}–${Math.min((page+1)*sourcePageSize,total)} จาก ${total.toLocaleString('th-TH')} รายการ</span><button class="secondary" data-source-page="${key}" data-page="${page-1}" ${page===0?'disabled':''}>ก่อนหน้า</button><button class="secondary" data-source-page="${key}" data-page="${page+1}" ${(page+1)*sourcePageSize>=total?'disabled':''}>ถัดไป</button></div>`}
function sourcePagedArRows(rows){sourceArTotal=rows.length;sourceArPage=Math.min(sourceArPage,Math.max(0,Math.ceil(rows.length/sourcePageSize)-1));return rows.slice(sourceArPage*sourcePageSize,(sourceArPage+1)*sourcePageSize)}
function sourceIncomeTable(rows){
 const groups=[['นัดชำระก่อนช่วงที่เลือก (ยังค้าง)',rows.filter(x=>x.certainty!=='received'&&x.date&&x.date<rangeStart)],['ตามวันนัดชำระ',rows.filter(x=>x.certainty!=='received'&&x.date&&x.date>=rangeStart)],['ยังไม่กำหนดวันนัดชำระ',rows.filter(x=>x.certainty!=='received'&&!x.date)],['รับชำระแล้ว',rows.filter(x=>x.certainty==='received')]];
 return groups.map(([title,items],key)=>{if(!items.length)return '';const page=Math.min(sourceIncomePages[key]||0,Math.max(0,Math.ceil(items.length/sourcePageSize)-1));sourceIncomePages[key]=page;const selected=items.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.party||'').localeCompare(b.party||'','th')).slice(page*sourcePageSize,(page+1)*sourcePageSize);return `<section class="income-date-group"><div class="income-group-head"><h3>${title}</h3><span>${items.length} รายการ · ${money(items.reduce((n,x)=>n+amount(x),0))} บาท</span></div>${sheetTable(selected)}${sourcePager(items.length,page,'income-'+key)}</section>`}).join('')||sheetTable([]);
}
function bindSourceReceivables(){
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
 document.querySelectorAll('[data-income-invoice]').forEach(b=>b.onclick=()=>{const invoice=arInvoices.find(i=>i.id===b.dataset.incomeInvoice);if(!invoice)return;view='ar-plan';arShowAllOutstanding=true;sourceArPage=0;arSearch=invoice.billNo;render();document.querySelector(`[data-ar-sheet-id="${invoice.id}"][data-ar-sheet-key="promiseDate"]`)?.focus()});
}

// Boot: load the existing saved source so earlier imports connect without reuploading.
loadReports().then(()=>{if(reportData?.rawSources?.ar){syncSourceReceivables();if(['overview','calendar','income','ar-plan'].includes(view))render()}});
