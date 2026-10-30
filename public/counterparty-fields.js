/* Local history suggestions and shared customer payment notes. */
const paymentBehaviors={'':'ยังไม่มีข้อมูล',early:'จ่ายก่อนกำหนดสม่ำเสมอ',on_due:'จ่ายตรงกำหนด',on_promise:'จ่ายตามวันนัด',usually_late:'จ่ายช้าเป็นประจำ',irregular:'จ่ายไม่แน่นอน',needs_followup:'ต้องติดตามก่อนจ่าย'};
const behaviorStorageKey='profess-customer-behavior-v1';
let customerBehaviorProfiles={};try{customerBehaviorProfiles=JSON.parse(localStorage.getItem(behaviorStorageKey)||'{}')||{}}catch{}
const suggestedBankAccounts=new Map();
const corporateNamePattern=new RegExp(['บริษัท','จำกัด','มหาชน','ห้างหุ้นส่วน','company','limited'].map(v=>v.normalize('NFKC')).join('|'),'g');
function counterpartyNorm(value){return String(value??'').normalize('NFKC').toLowerCase().replace(corporateNamePattern,'').replace(/\bco\.?\s*,?\s*ltd\.?\b/g,'').replace(/[^\p{L}\p{M}\p{N}]/gu,'')}
function normalizeBankAccount(value){const text=String(value??'').trim();if(text&&(!/^[0-9๐-๙０-９\s-]+$/.test(text)||!/[0-9๐-๙０-９]/.test(text)||text.length>80))throw Error('เลขที่บัญชีใช้ตัวเลข ช่องว่าง หรือขีด และไม่เกิน 80 ตัวอักษร');return text}
function normalizePaymentBehavior(value){let text=String(value??'').trim();text=({'จ่ายช้าปกติ':'usually_late','จ่ายตามดิว':'on_due','ถึงวันนัดจ่ายเลย':'on_promise','จ่ายก่อนเสมอ':'early'})[text]||text;const entry=Object.entries(paymentBehaviors).find(([key,label])=>key===text||label===text);if(!entry)throw Error('พฤติกรรมการจ่ายไม่อยู่ในตัวเลือก');return entry[0]}
function supplierAccountSuggestions(party,source,currentId){
 const name=counterpartyNorm(party);if(!name)return [];
 const candidates=source.filter(x=>x.type==='out'&&String(x.id)!==String(currentId)&&x.bankAccount&&counterpartyNorm(x.party));
 let matched=candidates.filter(x=>counterpartyNorm(x.party)===name),exact=matched.length>0;
 if(!exact&&name.length>=5){
  const pairs=value=>new Set(Array.from({length:Math.max(0,value.length-1)},(_,i)=>value.slice(i,i+2)));
  const tokens=pairs(name),score=value=>{const other=pairs(value);return 2*[...tokens].filter(v=>other.has(v)).length/(tokens.size+other.size||1)};
  matched=candidates.filter(x=>score(counterpartyNorm(x.party))>=.82);
 }
 const unique=new Map();for(const row of matched){const account=String(row.bankAccount),key=account.replace(/[\s-]/g,'');if(!unique.has(key))unique.set(key,{account,party:row.party,exact})}
 return [...unique.values()];
}
function bankAccountCell(row,attr){const id='bank-options-'+String(row.id).replace(/[^\w-]/g,'_');return `<td class="bank-account-cell"><input ${attr('bankAccount')} type="text" inputmode="text" maxlength="80" list="${id}" autocomplete="off" value="${esc(row.bankAccount||'')}" placeholder="เลขที่บัญชี Supplier"><datalist id="${id}"></datalist><small data-bank-suggestion="${row.id}"></small></td>`}
function updateSupplierAccountSuggestions(row){
 const input=document.querySelector(`[data-grid-id="${row.id}"][data-grid-key="bankAccount"]`);if(!input)return;
 const suggestions=supplierAccountSuggestions(row.party,data,row.id),list=document.getElementById(input.getAttribute('list')),hint=document.querySelector(`[data-bank-suggestion="${row.id}"]`);
 list.innerHTML=suggestions.map(x=>`<option value="${esc(x.account)}">${esc((x.exact?'บัญชีเดิม: ':'ชื่อใกล้เคียง: ')+x.party)}</option>`).join('');
 const prior=suggestedBankAccounts.get(row.id);
 if(prior&&prior.name!==counterpartyNorm(row.party)&&row.bankAccount===prior.account){row.bankAccount='';input.value='';suggestedBankAccounts.delete(row.id)}
 if(!row.bankAccount&&suggestions.length===1&&suggestions[0].exact){row.bankAccount=suggestions[0].account;input.value=row.bankAccount;suggestedBankAccounts.set(row.id,{name:counterpartyNorm(row.party),account:row.bankAccount})}
 if(hint)hint.textContent=suggestions.length?(suggestions[0].exact?`พบ ${suggestions.length} บัญชีจากชื่อเดิม`:`พบ ${suggestions.length} บัญชีจากชื่อใกล้เคียง · โปรดเลือก`):'กรอกเพื่อใช้เลือกครั้งถัดไป';
}
function customerBehaviorIdentity(row,kind='cash'){
 let invoice=kind==='ar'?row:typeof arInvoices==='undefined'?null:arInvoices.find(i=>i.id===row.arInvoiceId);
 if(!invoice&&kind==='cash'&&typeof arInvoices!=='undefined'){
  const matches=arInvoices.filter(i=>counterpartyNorm(i.customer)===counterpartyNorm(row.party));
  const keys=new Set(matches.filter(i=>i.sourceCompany&&i.sourceCustomerCode).map(i=>counterpartyNorm(i.sourceCompany)+'|'+String(i.sourceCustomerCode).trim().toUpperCase()));
  if(keys.size===1)invoice=matches.find(i=>i.sourceCompany&&i.sourceCustomerCode);
  if(keys.size>1)return 'row:'+String(row.id);
 }
 if(invoice?.sourceCompany&&invoice?.sourceCustomerCode)return 'customer:'+counterpartyNorm(invoice.sourceCompany)+'|'+String(invoice.sourceCustomerCode).trim().toUpperCase();
 return 'name:'+counterpartyNorm(kind==='ar'?row.customer:row.party);
}
function customerBehavior(row,kind='cash'){
 if(kind==='ar'&&row.behaviorTouched)return {paymentBehavior:row.paymentBehavior||'',behaviorNote:row.behaviorNote||''};
 const id=customerBehaviorIdentity(row,kind);return customerBehaviorProfiles[id]||(row.behaviorCustomerKey&&row.behaviorCustomerKey!==id?{paymentBehavior:'',behaviorNote:''}:{paymentBehavior:row.paymentBehavior||'',behaviorNote:row.behaviorNote||''});
}
function setCustomerBehavior(row,key,value,kind='cash'){
 const next={...customerBehavior(row,kind),[key]:key==='paymentBehavior'?normalizePaymentBehavior(value):String(value??'').trim()};
 if(next.behaviorNote.length>300)throw Error('หมายเหตุพฤติกรรมการจ่ายไม่เกิน 300 ตัวอักษร');
 const id=customerBehaviorIdentity(row,kind);if(id==='name:')throw Error('กรอกชื่อลูกค้าก่อนระบุพฤติกรรมการจ่าย');
 const profiles={...customerBehaviorProfiles,[id]:next};localStorage.setItem(behaviorStorageKey,JSON.stringify(profiles));customerBehaviorProfiles=profiles;
 Object.assign(row,next,{behaviorCustomerKey:id});return next;
}
function saveCustomerBehaviorEdits(rows){for(const row of rows)if(row.behaviorTouched){setCustomerBehavior(row,'paymentBehavior',row.paymentBehavior||'','ar');setCustomerBehavior(row,'behaviorNote',row.behaviorNote||'','ar');delete row.behaviorTouched}}
function customerBehaviorCells(row,attr){const values=customerBehavior(row);return `<td><select ${attr('paymentBehavior')}>${sheetOptions(paymentBehaviors,values.paymentBehavior)}</select></td><td><input ${attr('behaviorNote')} maxlength="300" value="${esc(values.behaviorNote)}" placeholder="เช่น จ่ายวันที่ 15 / สิ้นเดือน"></td>`}
function refreshArBehaviorRow(row){const values=customerBehavior(row,'ar');for(const key of ['paymentBehavior','behaviorNote']){const input=document.querySelector(`[data-ar-sheet-id="${row.id}"][data-ar-sheet-key="${key}"]`);if(input&&document.activeElement!==input)input.value=values[key]}}
function bindCounterpartyFields(){
 if(view==='list')document.querySelectorAll('[data-grid-key="party"]').forEach(input=>{
  const original=input.onchange;input.onchange=event=>{original?.(event);const row=data.find(x=>String(x.id)===input.dataset.gridId);if(row){updateSupplierAccountSuggestions(row);save()}};
 });
 if(view==='income')document.querySelectorAll('[data-grid-key="party"]').forEach(input=>{const original=input.onchange;input.onchange=event=>{original?.(event);const row=data.find(x=>String(x.id)===input.dataset.gridId);if(row)for(const key of ['paymentBehavior','behaviorNote']){const field=document.querySelector(`[data-grid-id="${row.id}"][data-grid-key="${key}"]`);if(field)field.value=customerBehavior(row)[key]}}});
 if(view==='list'){let changed=false;for(const row of data.filter(x=>x.type==='out')){const before=row.bankAccount;updateSupplierAccountSuggestions(row);if(before!==row.bankAccount)changed=true}if(changed)save();}
}
