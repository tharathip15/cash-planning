/* Customer-wide debt classification. Original sales and AR snapshots stay intact. */
const debtorGroups={'':'ยังไม่จัดกลุ่ม','1':'หนี้เสีย','2':'ดำเนินการฟ้องร้อง','3':'เคลมประกัน','4':'ออกหนังสือติดตาม','5':'อื่น ๆ'};
const debtorStatusStoreKey='profess-debtor-status-v1';
let debtorStatusEdits={};try{debtorStatusEdits=JSON.parse(localStorage.getItem(debtorStatusStoreKey)||'{}')||{}}catch{}
let debtorStatusSeed=[],debtorSeedLoaded=false;
const debtorStatusCache=new Map();let debtorCachedSeed=null,debtorCachedEdits=null;
let debtorView={company:'all',group:'all',query:''};
function debtorCompany(value){const n=counterpartyNorm(value);return ['pf','profess','โปรเฟส','โปรเฟสอินดัสเทรียลกรุ๊ป'].includes(n)?'PF':['nv','novat','โนวาท'].includes(n)?'NV':['tnp','ทีเอ็นพี','ทีเอ็นพีอินเตอร์เทรด'].includes(n)?'TNP':String(value||'ไม่ระบุบริษัท').trim().toUpperCase()}
function debtorName(value){return counterpartyNorm(String(value||'').replace(/หจก\.?/g,''))}
function debtorIdentity(company,code,name){const prefix=debtorCompany(company)+'|';return {company:debtorCompany(company),code:String(code||'').trim(),name:String(name||''),key:prefix+(code?'code:'+String(code).trim().toUpperCase():'name:'+debtorName(name)),nameKey:prefix+'name:'+debtorName(name)}}
function debtorStatus(company,code,name){
 if(debtorCachedSeed!==debtorStatusSeed||debtorCachedEdits!==debtorStatusEdits){debtorStatusCache.clear();debtorCachedSeed=debtorStatusSeed;debtorCachedEdits=debtorStatusEdits}
 const cacheKey=JSON.stringify([company,code,name]);if(debtorStatusCache.has(cacheKey))return debtorStatusCache.get(cacheKey);
 const id=debtorIdentity(company,code,name),edit=debtorStatusEdits[id.key]||debtorStatusEdits[id.nameKey];if(edit){debtorStatusCache.set(cacheKey,edit);return edit;}
 const seed=debtorStatusSeed.find(r=>r.company===id.company&&debtorName(r.name)===debtorName(name));
 const result=seed?{group:seed.group,note:seed.note,seedId:seed.id,source:'PDF'}:{group:'',note:''};debtorStatusCache.set(cacheKey,result);return result;
}
function debtorExcluded(company,code,name){return ['1','2','3'].includes(debtorStatus(company,code,name).group)}
function debtorReportStatus(row){return debtorStatus(row[1],row[2],row[4])}
function debtorReportExcluded(row){return debtorExcluded(row[1],row[2],row[4])}
function saveDebtorStatus(company,code,name,group,note){
 if(!Object.hasOwn(debtorGroups,group))throw Error('สถานะลูกหนี้ไม่ถูกต้อง');
 const id=debtorIdentity(company,code,name),old=debtorStatus(company,code,name);
 const next={...debtorStatusEdits,[id.key]:{...old,group,note:String(note??old.note??'').slice(0,500),source:'ผู้ใช้',updatedAt:new Date().toISOString()}};
 localStorage.setItem(debtorStatusStoreKey,JSON.stringify(next));debtorStatusEdits=next;
}
function debtorStatusSelect(company,code,name){const current=debtorStatus(company,code,name);return `<select class="debtor-status-select" data-debtor-company="${esc(debtorCompany(company))}" data-debtor-code="${esc(code||'')}" data-debtor-name="${esc(name||'')}" aria-label="สถานะลูกหนี้ ${esc(name||code||'')}">${Object.entries(debtorGroups).map(([key,label])=>`<option value="${key}" ${key===current.group?'selected':''}>${key?key+' · ':''}${label}</option>`).join('')}</select>`}
function bindDebtorStatusSelects(root=document){root.querySelectorAll('[data-debtor-company]').forEach(input=>input.onchange=()=>{
 try{saveDebtorStatus(input.dataset.debtorCompany,input.dataset.debtorCode,input.dataset.debtorName,input.value);if(typeof syncAllArPlans==='function')syncAllArPlans();render()}catch(error){input.setCustomValidity(error.message);input.reportValidity()}
})}
function debtorCurrentEntries(snapshot){
 const result=new Map(),raw=snapshot?.rawSources?.ar?.rows||[],names=new Map((snapshot?.credit?.rows||[]).map(r=>[debtorIdentity(r[1],r[2],r[3]).key,r]));
 for(const r of raw){const id=debtorIdentity(r.company,r.code,r.name),old=result.get(id.key)||{...id,current:0,bills:0};old.current+=Number(r.balance)||0;old.bills++;if(!old.name)old.name=names.get(id.key)?.[3]||'';result.set(id.key,old)}
 if(typeof reportReceiptReductions==='function'&&snapshot?.rawSources?.ar){const link={asOf:snapshot.rawSources.ar.asOf||snapshot.asOf,bills:raw};const reductions=reportReceiptReductions(link,typeof data==='undefined'?[]:data,typeof arInvoices==='undefined'?[]:arInvoices);for(const r of raw){const item=result.get(debtorIdentity(r.company,r.code,r.name).key);if(item&&!item.reduced){item.current-=reductions.get(rrKey(r.company,r.code))?.total||0;item.reduced=true}}}
 for(const [key,row]of names)if(!result.has(key))result.set(key,{...debtorIdentity(row[1],row[2],row[3]),current:null,bills:0});
 return [...result.values()].map(r=>({...r,current:r.current===null?null:Math.round(r.current*100)/100}));
}
function debtorReportEntries(snapshot=reportData){
 const current=debtorCurrentEntries(snapshot),used=new Set(),out=[];
 for(const row of current){const status=debtorStatus(row.company,row.code,row.name);const seed=debtorStatusSeed.find(r=>r.id===status.seedId||r.company===row.company&&debtorName(r.name)===debtorName(row.name));if(seed)used.add(seed.id);if(!status.group)continue;out.push({...row,...status,documentTotal:seed?.documentTotal??null,documentOD60:seed?.documentOD60??null,year:seed?.year??'',maxOD:seed?.maxOD??null})}
 for(const seed of debtorStatusSeed)if(!used.has(seed.id)){const status=debtorStatus(seed.company,'',seed.name);if(status.group)out.push({...debtorIdentity(seed.company,'',seed.name),...seed,...status,current:null,bills:0})}
 return out;
}
function debtorVisibleEntries(){return debtorReportEntries().filter(r=>(debtorView.company==='all'||r.company===debtorView.company)&&(debtorView.group==='all'||r.group===debtorView.group)&&counterpartyNorm([r.name,r.code,r.note,debtorGroups[r.group]].join(' ')).includes(counterpartyNorm(debtorView.query)))}
function debtorDetail(row){
 const source=reportData?.rawSources?.ar?.rows||[],bills=source.filter(r=>debtorIdentity(r.company,r.code,r.name).key===row.key);
 const cols=[{key:'company',label:'บริษัท'},{key:'code',label:'รหัสลูกค้า'},{key:'bill',label:'เลขบิล'},{key:'date',label:'วันที่เอกสาร'},{key:'due',label:'วันครบกำหนด'},{key:'balance',label:'ยอดค้างตามไฟล์',type:'number'}];
 const records=bills.map(r=>({...r,company:debtorCompany(r.company)}));
 showCardDetail(row.name,`${row.company} · ${debtorGroups[row.group]} · ${row.note||''}`,`<p>ยอดตามเอกสาร ${row.documentTotal===null?'—':money(row.documentTotal)} บาท · ยอดค้างในชุดปัจจุบัน ${row.current===null?'ไม่พบบิลในชุดที่นำเข้า':money(row.current)+' บาท'}</p><div class="scroll"><table><thead><tr>${cols.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${records.map(r=>`<tr>${cols.map(c=>`<td>${reportFormat(r[c.key],c)}</td>`).join('')}</tr>`).join('')||'<tr><td colspan="6">ไม่มีเลขบิลในเอกสาร PDF หรือชุดลูกหนี้ที่นำเข้า</td></tr>'}</tbody></table></div>`,{kind:'ar',report:true,name:'รายละเอียดสถานะลูกหนี้-'+row.company,cols,rows:records});
}
const debtorExportColumns=[{key:'company',label:'บริษัท'},{key:'code',label:'รหัสลูกค้า'},{key:'name',label:'ลูกค้า'},{key:'status',label:'สถานะ'},{key:'current',label:'ยอดค้างในชุดปัจจุบัน',type:'number'},{key:'documentTotal',label:'ยอดตามเอกสาร PDF',type:'number'},{key:'documentOD60',label:'OD มากกว่า 60 ตาม PDF',type:'number'},{key:'year',label:'ปีเปิดบิลตาม PDF'},{key:'maxOD',label:'Max OD ตาม PDF',type:'number'},{key:'note',label:'รายละเอียดสถานะ'}];
function debtorExportSpec(rows=debtorVisibleEntries()){return {kind:'ar',report:true,name:'สถานะลูกหนี้',cols:debtorExportColumns,rows:rows.map(r=>({...r,status:r.group+' · '+debtorGroups[r.group],current:r.current??'',documentTotal:r.documentTotal??'',documentOD60:r.documentOD60??'',maxOD:r.maxOD??''}))}}
function renderDebtorStatus(){
 document.querySelector('main > .toolbar').hidden=true;$('#title').textContent='สถานะลูกหนี้';$('.eyebrow').textContent='ACCOUNTS RECEIVABLE / DEBT STATUS';$('#add').hidden=true;
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 if(!reportData||!debtorSeedLoaded){$('#content').innerHTML='<div class="notice">กำลังอ่านสถานะลูกหนี้…</div>';loadReports();return}
 const rows=debtorVisibleEntries(),groupEntries=Object.entries(debtorGroups).filter(([k])=>k),sum=(list,key)=>list.reduce((n,r)=>n+(Number(r[key])||0),0);
 $('#content').innerHTML=`<section class="report-workspace"><div class="report-intro"><div><h2>สถานะลูกหนี้แยกตามบริษัท</h2><p>PF = โปรเฟส · NV = Novat · TNP = ทีเอ็นพี<br>กลุ่ม 1–3 แยกเฉพาะยอดค้างจากตารางรายเดือน · ยอดขายเดิมคงอยู่</p></div><button class="primary" id="debtor-export">ส่งออก Excel</button></div><div class="report-filters"><label>บริษัท<select id="debtor-company"><option value="all">ทั้งหมด</option>${['PF','NV','TNP'].map(c=>`<option ${debtorView.company===c?'selected':''}>${c}</option>`).join('')}</select></label><label>กลุ่มสถานะ<select id="debtor-group"><option value="all">ทั้งหมด</option>${groupEntries.map(([k,l])=>`<option value="${k}" ${debtorView.group===k?'selected':''}>${k} · ${l}</option>`).join('')}</select></label><label>ค้นหาลูกค้า<input id="debtor-search" value="${esc(debtorView.query)}" placeholder="ชื่อ รหัส หรือสถานะ"></label></div><div class="report-metrics debtor-status-metrics">${groupEntries.map(([key,label])=>{const group=rows.filter(r=>r.group===key);return `<div data-debtor-card="${key}"><small>${key} · ${label}</small><strong>${money(sum(group,'current'))}</strong><small>${group.length} ราย · ไม่พบบิลปัจจุบัน ${group.filter(r=>r.current===null).length} ราย</small></div>`}).join('')}</div><p class="helper">การ์ดรวมเฉพาะยอดค้างที่พบในชุดข้อมูลปัจจุบัน · ยอดตาม PDF แสดงแยกเพื่อเทียบ ไม่บวกซ้ำ</p><div class="report-table-wrap"><table class="report-table debtor-table"><thead><tr><th>บริษัท</th><th>รหัสลูกค้า</th><th>ลูกค้า</th><th>ยอดค้างในชุดปัจจุบัน</th><th>ยอดตาม PDF</th><th>สถานะ</th><th>รายละเอียด</th></tr></thead><tbody>${rows.map((r,index)=>`<tr><td>${esc(r.company)}</td><td>${esc(r.code||'—')}</td><td><button class="report-cell-link" data-debtor-detail="${index}">${esc(r.name)}</button></td><td class="money">${r.current===null?'ไม่พบบิล':money(r.current)}</td><td class="money">${r.documentTotal===null?'—':money(r.documentTotal)}</td><td>${debtorStatusSelect(r.company,r.code,r.name)}</td><td><input maxlength="500" data-debtor-note="${index}" value="${esc(r.note||'')}" aria-label="รายละเอียดสถานะ ${esc(r.name)}"></td></tr>`).join('')||'<tr><td colspan="7">ไม่พบรายการตามตัวกรอง</td></tr>'}</tbody></table></div></section>`;
 $('#debtor-company').value=debtorView.company;$('#debtor-group').value=debtorView.group;
 for(const key of ['company','group'])$('#debtor-'+key).onchange=e=>{debtorView[key]=e.target.value;renderDebtorStatus()};
 $('#debtor-search').oninput=e=>{debtorView.query=e.target.value;renderDebtorStatus();$('#debtor-search').focus()};
 $('#debtor-export').onclick=e=>exportStyledExcel(false,debtorExportSpec(rows),e.currentTarget);
 document.querySelectorAll('[data-debtor-card]').forEach(card=>bindCard(card,()=>{const list=rows.filter(r=>r.group===card.dataset.debtorCard);const spec=debtorExportSpec(list);showCardDetail(debtorGroups[card.dataset.debtorCard],list.length+' รายการ · ยอดในชุดปัจจุบัน '+money(sum(list,'current'))+' บาท',`<div class="scroll"><table><thead><tr>${spec.cols.map(c=>`<th>${c.label}</th>`).join('')}</tr></thead><tbody>${spec.rows.map(r=>`<tr>${spec.cols.map(c=>`<td>${reportFormat(r[c.key],c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,spec)}));
 document.querySelectorAll('[data-debtor-detail]').forEach(b=>b.onclick=()=>debtorDetail(rows[Number(b.dataset.debtorDetail)]));
 document.querySelectorAll('[data-debtor-note]').forEach(input=>input.onchange=()=>{const r=rows[Number(input.dataset.debtorNote)];saveDebtorStatus(r.company,r.code,r.name,r.group,input.value)});
 bindDebtorStatusSelects();
}

// Boot is separate from the pure status and reconciliation functions for tests.
document.querySelector('#report-menu')?.insertAdjacentHTML('beforeend','<button data-view="report-debt-status" id="nav-debtor-status">สถานะลูกหนี้</button>');
if($('#nav-debtor-status'))$('#nav-debtor-status').onclick=()=>{view='report-debt-status';render();document.querySelector('aside')?.removeAttribute('data-mobile-open')};
(globalThis.CashCentral ? globalThis.CashCentral.fetchAsset('debtor-status-seed.json') : fetch('debtor-status-seed.json')).then(r=>{if(!r.ok)throw Error('อ่านเอกสารสถานะไม่สำเร็จ');return r.json()}).then(d=>{debtorStatusSeed=d.rows;debtorSeedLoaded=true;if(view.startsWith('report-')||view==='ar-plan')render()}).catch(e=>{$('#save-message').textContent=e.message});
