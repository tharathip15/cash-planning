/* Shared table navigation. Width preferences stay on this device, outside finance data. */
(function () {
 const storageKey='cash-table-widths-v1',states=new Set();let preferences={};
 try{preferences=JSON.parse(localStorage.getItem(storageKey)||'{}');if(!preferences||typeof preferences!=='object'||Array.isArray(preferences))preferences={}}catch{}
 function getPageSize(){let value;try{value=localStorage.getItem('cash-table-page-size')}catch{}return value==='all'?Number.MAX_SAFE_INTEGER:[25,50,100,250].includes(Number(value))?Number(value):50}
 function pageWindow(total,page,size){const pages=Math.max(1,Math.ceil(total/size)),current=Math.max(0,Math.min(page,pages-1));return {page:current,start:current*size,end:Math.min((current+1)*size,total),pages}}
 function screenBand(width){return width<=650?'mobile':width<=1100?'tablet':'desktop'}
 function fitColumnWidths(widths,available,minimum=0){const total=widths.reduce((sum,width)=>sum+width,0);if(!total)return [];const target=Math.max(total,available,minimum);return widths.map(width=>width*target/total)}
 function compactWidth(label,width,viewport=1440){
  const small=viewport<=1100,text=String(label||'').replace(/^[A-Z]\s*·\s*/, '').trim();
  if(/^(#|ที่|ลำดับ)$/.test(text))return 44;
  if(/จัดการ/.test(text))return small?260:280;
  if(/รหัสลูกค้า/.test(text))return small?82:92;
  if(/^บริษัท$/.test(text))return small?65:75;
  if(/จำนวนวัน|Overdue|เครดิตเทอม|^เครดิต$/.test(text))return small?82:92;
  if(/วันที่|วันนัด|นัดรับ|ครบกำหนด|ส่งฉบับ|ยื่นประกัน|ผิดนัด/.test(text))return small?110:118;
  if(/หมายเหตุ/.test(text))return small?125:145;
  if(/พฤติกรรม/.test(text))return small?150:165;
  if(/ลูกค้า|Supplier|Customer|คู่ค้า/i.test(text))return small?145:170;
  if(/ฝ่ายขาย/.test(text))return small?110:130;
  if(/ยอด|บาท|เงินต้น|ดอกเบี้ย/.test(text))return small?96:108;
  if(/ช่วง|เวลา|^BU$/.test(text))return small?76:86;
  return Math.max(72,Math.min(small?130:150,Number(width)||120));
 }
 function headerLayout(rows){
  const grid=[],cells=[];let count=0;
  Array.from(rows).forEach((row,r)=>{grid[r]||=[];let column=0;for(const cell of row.cells){while(grid[r][column])column++;const span=Math.max(1,cell.colSpan||1),height=Math.max(1,cell.rowSpan||1);cells.push({cell,column,span});for(let y=r;y<r+height;y++){grid[y]||=[];for(let x=column;x<column+span;x++)grid[y][x]=true}column+=span;count=Math.max(count,column)}});
  return {count,cells};
 }
 function enhance(table){
  if(table.dataset.tableEnhanced||!table.rows.length||!table.getClientRects().length)return;
  const layout=headerLayout(table.tHead?.rows||[table.rows[0]]);if(!layout.count)return;
  table.dataset.tableEnhanced='true';
  const baseKey='compact-v2|'+(typeof view==='undefined'?'detail':view)+'|'+table.className+'|'+layout.cells.map(({cell})=>cell.textContent.trim()).join('|');let band=screenBand(window.innerWidth||1440),key=baseKey+'|'+band;
  let scroller=table.parentElement;
  if(!scroller.matches('.sheet-wrap,.ar-sheet-scroll,.report-table-wrap,.scroll,.workspace-table-scroll')){scroller=document.createElement('div');table.before(scroller);scroller.append(table)}
  scroller.classList.add('workspace-table-scroll');scroller.tabIndex=0;scroller.setAttribute('role','region');scroller.setAttribute('aria-label','ตารางข้อมูล เลื่อนซ้ายขวาหรือขึ้นลงได้');
  const workbench=document.createElement('section');workbench.className='table-workbench';scroller.before(workbench);workbench.append(scroller);
  const tools=document.createElement('div');tools.className='table-tools';tools.innerHTML='<span>เลื่อนตารางได้ทั้งสองแนว · ลากขอบหัวคอลัมน์เพื่อปรับความกว้าง</span><div><button type="button" data-table-action="left" aria-label="เลื่อนตารางไปทางซ้าย">←</button><button type="button" data-table-action="right" aria-label="เลื่อนตารางไปทางขวา">→</button><button type="button" data-table-action="reset">คืนความกว้าง</button><button type="button" data-table-action="expand" aria-expanded="false">ขยายตาราง</button></div>';
  const top=document.createElement('div');top.className='table-top-scroll';top.tabIndex=0;top.setAttribute('role','region');top.setAttribute('aria-label','แถบเลื่อนแนวนอนด้านบน');const track=document.createElement('div');top.append(track);workbench.prepend(tools,top);
  let group=table.querySelector(':scope > colgroup');if(!group){group=document.createElement('colgroup');table.prepend(group)}
  while(group.children.length<layout.count)group.append(document.createElement('col'));
  const cols=Array.from(group.children),labels=[],declared=[];let defaults=cols.map((col,index)=>{
   const header=layout.cells.find(item=>item.column===index&&item.span===1),measured=header?.cell.getBoundingClientRect().width||160;
   const reportWidth=table.classList.contains('report-customer-pinned')?({c0:52,c1:95,c2:110,c4:240,c3:165})[header?.cell.dataset.reportKey]:0;
   labels[index]=header?.cell.textContent||'';declared[index]=parseFloat(col.style.width)||reportWidth||measured;
   return compactWidth(labels[index],declared[index],window.innerWidth||1440);
  });
  const saved=preferences[key],widths=defaults.map((value,index)=>Number.isFinite(saved?.[index])?Math.max(index===0?44:60,Math.min(800,saved[index])):value);
  table.classList.add('workspace-data-table');
  const stretch=!!table.closest('.calendar-summary');
  const state={table,scroller,top,workbench,tools};states.add(state);
  const pageLabel=document.createElement('label');pageLabel.className='table-page-size';pageLabel.textContent='แถวต่อหน้า ';
  const pageSelect=document.createElement('select');pageSelect.setAttribute('aria-label','แถวต่อหน้า');pageSelect.innerHTML='<option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="250">250</option><option value="all">ทั้งหมด</option>';pageLabel.append(pageSelect);tools.querySelector('div').prepend(pageLabel);
  const sourcePaged=table.classList.contains('ar-sheet')||!!table.closest('.income-date-group,.receipt-reconciliation'),detailPaged=table.hasAttribute('data-detail-table');
  let page=0,size=sourcePaged&&typeof sourcePageSize!=='undefined'?sourcePageSize:detailPaged?Number(table.dataset.pageSize):getPageSize();
  pageSelect.value=size===Number.MAX_SAFE_INTEGER?'all':String(size);
  if(!sourcePaged&&!detailPaged){
   const rows=Array.from(table.tBodies).flatMap(body=>Array.from(body.rows)),pager=document.createElement('div');pager.className='table-pagination';pager.innerHTML='<span role="status"></span><button type="button" data-page-back>ก่อนหน้า</button><button type="button" data-page-next>ถัดไป</button>';workbench.append(pager);
   const status=pager.querySelector('span'),back=pager.querySelector('[data-page-back]'),next=pager.querySelector('[data-page-next]');
   function displayPage(){const w=pageWindow(rows.length,page,size);page=w.page;rows.forEach((row,index)=>row.hidden=index<w.start||index>=w.end);status.textContent=(rows.length?'แสดง '+(w.start+1)+'–'+w.end:'ไม่มีรายการ')+' จาก '+rows.length+' แถว · ยอดสรุปและส่งออกใช้ข้อมูลทั้งชุด';back.disabled=page===0;next.disabled=page>=w.pages-1;scroller.scrollTop=0}
   back.onclick=()=>{page--;displayPage()};next.onclick=()=>{page++;displayPage()};state.setPageSize=value=>{size=value;page=0;displayPage()};displayPage();
  }
  pageSelect.onchange=()=>{
   const value=pageSelect.value==='all'?Number.MAX_SAFE_INTEGER:Number(pageSelect.value);try{localStorage.setItem('cash-table-page-size',pageSelect.value)}catch{}
   if(sourcePaged&&typeof sourceSetPageSize==='function'){sourceSetPageSize(value);return}
   if(detailPaged){table.dispatchEvent(new CustomEvent('cash-page-size',{detail:{size:value}}));return}
   state.setPageSize(value);
  };
  function apply(){const rendered=stretch?fitColumnWidths(widths,scroller.clientWidth,670):widths;cols.forEach((col,index)=>{col.style.width=rendered[index]+'px'});table.style.setProperty('--first-column-width',rendered[0]+'px');const customer=layout.cells.find(item=>item.cell.dataset.arColumn==='customer');if(customer)scroller.style.setProperty('--ar-customer-width',rendered[customer.column]+'px');const code=layout.cells.find(item=>item.cell.dataset.reportKey==='c2');if(code)table.style.setProperty('--report-code-width',rendered[code.column]+'px');table.style.width=rendered.reduce((sum,width)=>sum+width,0)+'px';track.style.width=table.style.width}
  function save(){preferences[key]=widths.slice();try{localStorage.setItem(storageKey,JSON.stringify(preferences))}catch{}}
  state.reflow=()=>{const nextBand=screenBand(window.innerWidth||1440);if(nextBand===band)return;band=nextBand;key=baseKey+'|'+band;defaults=declared.map((width,index)=>compactWidth(labels[index],width,window.innerWidth||1440));const saved=preferences[key];widths.splice(0,widths.length,...defaults.map((width,index)=>Number.isFinite(saved?.[index])?Math.max(index===0?44:60,Math.min(800,saved[index])):width));apply()};
  function expanded(on){workbench.classList.toggle('is-expanded',on);tools.querySelector('[data-table-action="expand"]').textContent=on?'ย่อกลับ':'ขยายตาราง';tools.querySelector('[data-table-action="expand"]').setAttribute('aria-expanded',String(on));document.body.classList.toggle('table-expanded',Array.from(states).some(item=>item.workbench.classList.contains('is-expanded')));if(on)scroller.focus()}
  state.collapse=()=>expanded(false);
  tools.addEventListener('click',event=>{const action=event.target.closest('[data-table-action]')?.dataset.tableAction;if(action==='left'||action==='right')scroller.scrollBy({left:(action==='left'?-1:1)*Math.max(240,scroller.clientWidth*.5),behavior:'instant'});if(action==='reset'){widths.splice(0,widths.length,...defaults);apply();save()}if(action==='expand')expanded(!workbench.classList.contains('is-expanded'))});
  scroller.addEventListener('scroll',()=>{if(top.scrollLeft!==scroller.scrollLeft)top.scrollLeft=scroller.scrollLeft},{passive:true});top.addEventListener('scroll',()=>{if(scroller.scrollLeft!==top.scrollLeft)scroller.scrollLeft=top.scrollLeft},{passive:true});
  scroller.addEventListener('keydown',event=>{if(event.target!==scroller||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();scroller.scrollLeft+=(event.key==='ArrowLeft'?-1:1)*160});
  scroller.addEventListener('wheel',event=>{if(!event.shiftKey||!event.deltaY||event.deltaX)return;const before=scroller.scrollLeft;scroller.scrollLeft+=event.deltaY;if(before!==scroller.scrollLeft)event.preventDefault()},{passive:false});
  for(const {cell,column,span}of layout.cells){
   if(span!==1||cell.tagName!=='TH')continue;
   const handle=document.createElement('span');handle.className='table-column-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','ปรับความกว้าง '+cell.textContent.trim());
   function resize(value){widths[column]=Math.max(column===0?44:60,Math.min(800,value));handle.setAttribute('aria-valuenow',String(Math.round(widths[column])));apply()}
   handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();const start=event.clientX,width=widths[column];handle.setPointerCapture(event.pointerId);document.body.classList.add('table-resizing');const move=event=>resize(width+event.clientX-start),finish=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',finish);handle.removeEventListener('pointercancel',finish);document.body.classList.remove('table-resizing');save()};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish)});
   handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;event.preventDefault();resize(event.key==='Home'?defaults[column]:widths[column]+(event.key==='ArrowLeft'?-20:20));save()});handle.addEventListener('dblclick',()=>{resize(defaults[column]);save()});cell.append(handle);
  }
  apply();const observer=new ResizeObserver(()=>{if(stretch)apply();track.style.width=table.scrollWidth+'px'});observer.observe(table);if(stretch)observer.observe(scroller);state.dispose=()=>observer.disconnect();
 }
 function scan(root){if(root.nodeType===1&&root.matches('table'))enhance(root);root.querySelectorAll?.('table').forEach(enhance)}
 function cleanup(){for(const state of states)if(!state.table.isConnected){state.dispose();state.collapse();states.delete(state)}}
 function start(){scan(document);new MutationObserver(records=>{cleanup();for(const record of records)for(const node of record.addedNodes)if(node.nodeType===1)scan(node)}).observe(document.body,{childList:true,subtree:true});document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const state of states)state.collapse()});document.addEventListener('toggle',event=>{if(event.target.open)scan(event.target)},true)}
 window.addEventListener?.('resize',()=>{cleanup();for(const state of states)state.reflow()});
 window.CashTables={headerLayout,getPageSize,pageWindow,compactWidth,screenBand,fitColumnWidths,refresh:()=>scan(document)};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
