/* Keep ISO values for calculations and forms; present day/month/year independently of browser locale. */
(function(){
 function format(value){return String(value||'').replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1')}
 function parse(value){
  const m=String(value||'').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return '';
  const iso=m[3]+'-'+m[2]+'-'+m[1],date=new Date(iso+'T00:00:00Z');
  return Number(m[3])>=1900&&Number(m[3])<=2100&&!isNaN(date)&&date.toISOString().slice(0,10)===iso?iso:'';
 }
 window.CashDates={format,parse};
 if(typeof document==='undefined')return;
 const states=new WeakMap(),nativeValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
 function enhance(input){
  if(states.has(input))return;
  const wrapper=document.createElement('span'),text=document.createElement('input'),picker=document.createElement('button');
  wrapper.className='date-entry';text.type='text';text.className='date-entry-text';text.placeholder='DD/MM/YYYY';text.inputMode='numeric';text.maxLength=10;text.autocomplete='off';
  const label=input.getAttribute('aria-label')||input.name||'วันที่';text.setAttribute('aria-label',label+' (DD/MM/YYYY)');
  picker.type='button';picker.className='date-entry-picker';picker.textContent='▦';picker.setAttribute('aria-label','เลือก'+label+'จากปฏิทิน');
  const required=input.required;input.required=false;input.hidden=true;input.tabIndex=-1;
  input.after(wrapper);wrapper.append(text,picker);
  function sync(){
   text.value=format(nativeValue.get.call(input));text.disabled=input.disabled;text.readOnly=input.readOnly;text.required=required;
   picker.disabled=input.disabled||input.readOnly;picker.hidden=input.readOnly;text.setCustomValidity('');
  }
  Object.defineProperty(input,'value',{configurable:true,get(){return nativeValue.get.call(this)},set(value){nativeValue.set.call(this,value);sync()}});
  input.focus=options=>text.focus(options);
  states.set(input,{sync});sync();
  function commit(type){
   let raw=text.value.trim();if(/^\d{8}$/.test(raw)){raw=raw.slice(0,2)+'/'+raw.slice(2,4)+'/'+raw.slice(4);text.value=raw}
   const iso=parse(raw),invalid=raw&&!iso;
   text.setCustomValidity(invalid?'กรอกวันที่ DD/MM/YYYY เช่น 19/02/2026':iso&&input.min&&iso<input.min?'วันที่ต้องไม่น้อยกว่า '+format(input.min):iso&&input.max&&iso>input.max?'วันที่ต้องไม่เกิน '+format(input.max):'');
   nativeValue.set.call(input,iso);
   if(!invalid&&text.validity.valid)input.dispatchEvent(new Event(type,{bubbles:true}));
  }
  text.addEventListener('input',event=>{event.stopPropagation();commit('input')});
  text.addEventListener('change',event=>{event.stopPropagation();commit('change')});
  text.addEventListener('keydown',event=>{if(event.key==='Enter'){commit('change');if(!text.checkValidity()){event.preventDefault();text.reportValidity();return}if(!input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true})))event.preventDefault()}});
  input.addEventListener('input',sync,true);input.addEventListener('change',sync,true);
  picker.onclick=()=>{try{input.showPicker()}catch{text.focus()}};
  input.form?.addEventListener('reset',()=>queueMicrotask(sync));
 }
 function rewrite(node){
  if(node.nodeType===3){if(!node.parentElement?.closest('script,style,textarea,option,.date-entry')){const next=node.data.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g,(all,y,m,d)=>parse(d+'/'+m+'/'+y)?d+'/'+m+'/'+y:all);if(next!==node.data)node.data=next}return}
  if(node.nodeType!==1&&node.nodeType!==9)return;
  if(node.matches?.('script,style,textarea,option,.date-entry'))return;
  if(node.matches?.('input[type=date]'))enhance(node);
  for(const child of Array.from(node.childNodes))rewrite(child);
 }
 function start(){rewrite(document);new MutationObserver(records=>{for(const r of records){if(r.type==='attributes'){if(r.target.matches('input[type=date]')){if(states.has(r.target))states.get(r.target).sync();else enhance(r.target)}}else if(r.type==='characterData')rewrite(r.target);else for(const node of r.addedNodes)rewrite(node)}}).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['type','value','disabled','readonly','min','max']})}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
