/* Explicit loopback-only sandbox. Never connects to the central API or edits legacy storage. */
(function () {
 'use strict';
 const enabled=['127.0.0.1','localhost','[::1]'].includes(location.hostname)&&new URLSearchParams(location.search).get('mode')==='test';
 const original=Object.fromEntries(['getItem','setItem','removeItem','clear'].map(key=>[key,Storage.prototype[key]]));
 const owns=key=>String(key).startsWith('profess-');
 let cache={},db,timer,status,writing=Promise.resolve();
 function transact(mode,action){return new Promise((resolve,reject)=>{
  const tx=db.transaction('workspace',mode),request=action(tx.objectStore('workspace'));
  tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('TEST_STORAGE_FAILED'));
 })}
 function flush(){
  clearTimeout(timer);const snapshot={storage:{...cache},savedAt:new Date().toISOString()};
  writing=writing.catch(()=>{}).then(()=>transact('readwrite',store=>store.put(snapshot,'current')));
  writing.then(()=>{status.textContent='โหมดทดสอบ · บันทึกสำเนาในเครื่องแล้ว · ไม่บันทึกเข้าฐานกลาง'},()=>{status.textContent='โหมดทดสอบ · บันทึกสำเนาไม่สำเร็จ กรุณาส่งออก Excel ก่อนปิดหน้านี้'});
  return writing;
 }
 function changed(){status.textContent='โหมดทดสอบ · กำลังบันทึกสำเนาในเครื่อง · ไม่บันทึกเข้าฐานกลาง';clearTimeout(timer);timer=setTimeout(()=>{flush().catch(()=>{})},150)}
 async function initialize(){
  if(!enabled)throw Error('TEST_MODE_REQUIRES_EXPLICIT_LOOPBACK_URL');
  db=await new Promise((resolve,reject)=>{const request=indexedDB.open('cash-planning-test-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('workspace');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
  const saved=await transact('readonly',store=>store.get('current'));
  if(saved?.storage)cache={...saved.storage};
  else{const response=await fetch('/workspace-snapshot.json');if(!response.ok)throw Error('TEST_SNAPSHOT_UNAVAILABLE');cache={...(await response.json()).storage}}
  const bar=document.createElement('div');bar.className='cash-test-status';bar.setAttribute('data-cash-test','');
  const title=document.createElement('strong');title.textContent='ทดสอบในเครื่อง';bar.append(title);
  status=document.createElement('span');status.setAttribute('role','status');status.textContent='ใช้สำเนาข้อมูล PF / TNP / NV ที่มากับเวอร์ชันนี้ · ไม่ใช่ยอดสดจากฐานกลาง';bar.append(status);
  const note=document.createElement('small');note.textContent='เริ่มจากสำเนาชุดที่มากับโค้ด ไม่ใช่ยอดสดจากฐานกลาง · ลองนำเข้า แก้วันนัด และยืนยันยอดได้ · เก็บข้อมูลทดสอบแยกและเปิดต่อได้หลังรีเฟรช';bar.append(note);
  document.getElementById('profess-workspace').before(bar);
  const footer=document.querySelector?.('#profess-workspace .footer');if(footer)footer.textContent='โหมดทดสอบ · ข้อมูลบันทึกแยกในเครื่องนี้ · ส่งออก Excel ได้';
  Storage.prototype.getItem=function(key){return this===localStorage&&owns(key)?cache[key]??null:original.getItem.call(this,key)};
  Storage.prototype.setItem=function(key,value){if(this!==localStorage||!owns(key))return original.setItem.call(this,key,value);cache[String(key)]=String(value);changed()};
  Storage.prototype.removeItem=function(key){if(this!==localStorage||!owns(key))return original.removeItem.call(this,key);delete cache[String(key)];changed()};
  Storage.prototype.clear=function(){if(this===localStorage)throw Error('กรุณาส่งออกข้อมูลทดสอบก่อนล้าง');return original.clear.call(this)};
  await flush();
 }
 window.CashCentral={initialize,flush,testMode:true,fetchAsset(name){
  if(!enabled||!['data.json','debtor-status-seed.json','reports-data.json'].includes(name))return Promise.resolve({ok:false});
  return fetch('/'+name);
 }};
})();
