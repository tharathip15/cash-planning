/* Legacy modules keep their synchronous API; shared values live in a per-tab cache.
   The original localStorage data is never overwritten. The server is authoritative. */
(function () {
  'use strict';
  const keys = ['profess-reports-v1','profess-reports-backup-v1','profess-added-v1','profess-edits-v2','profess-ar-v1','profess-ar-sheet-v1','profess-source-ar-edits-v1','profess-debtor-status-v1','profess-customer-behavior-v1'];
  const original = Object.fromEntries(['getItem','setItem','removeItem','clear'].map(name => [name, Storage.prototype[name]]));
  let cache = {}, baseline = {}, assets = {}, revision = 0, timer, inFlight = null, running = false, blocked = false, ready = false, db, bar, intentionalReload = false;
  const clientId = sessionStorage.getItem('cash-client-id') || crypto.randomUUID();
  sessionStorage.setItem('cash-client-id', clientId);
  const differences = () => Object.fromEntries(keys.filter(key => (cache[key] ?? null) !== (baseline[key] ?? null)).map(key => [key, cache[key] ?? null]));
  const pending = () => inFlight || Object.keys(differences()).length;
  function status(text, level = 'normal', action) {
    if (!bar) return;
    bar.dataset.level = level; bar.querySelector('span').textContent = text;
    const retry = bar.querySelector('[data-retry]'); retry.hidden = !action; retry.textContent = action === 'reload' ? 'โหลดข้อมูลล่าสุด' : 'ลองบันทึกอีกครั้ง';
    retry.onclick = async () => {
      if (action !== 'reload') return flush();
      try { if (pending()) await archivePending(); intentionalReload = true; location.reload(); }
      catch { status('เก็บสำเนาการแก้ไขไม่สำเร็จ กรุณากดสำรองข้อมูลก่อนโหลดใหม่', 'error', 'reload'); }
    };
    bar.querySelector('[data-export]').hidden = !pending() && !blocked;
  }
  function exportData(storage, name) {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ savedAt:new Date().toISOString(), revision, storage }, null, 2)], { type:'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function freeze(message) {
    blocked = true; const workspace = document.getElementById('profess-workspace');
    if (workspace) workspace.inert = true;
    status(message, 'error', 'reload');
  }
  function persist(value) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox', 'readwrite');
      if (value) tx.objectStore('outbox').put(value, clientId); else tx.objectStore('outbox').delete(clientId);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || Error('เก็บข้อมูลรอบันทึกไม่สำเร็จ'));
    });
  }
  function archivePending() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox','readwrite'), store = tx.objectStore('outbox');
      store.put({request:inFlight,current:{...cache},baseRevision:revision,archivedAt:new Date().toISOString()},'recovery:'+crypto.randomUUID());
      store.delete(clientId); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
    });
  }
  async function loadOutbox() {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('pfig-cash-pending', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('outbox');
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    return new Promise((resolve, reject) => {
      const tx = db.transaction('outbox'), store=tx.objectStore('outbox'), all=store.getAll(), ids=store.getAllKeys();
      tx.oncomplete=()=>resolve({own:all.result[ids.result.indexOf(clientId)],others:all.result.filter((_,i)=>ids.result[i]!==clientId)});
      tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
    });
  }
  async function api(options = {}, suffix = '') {
    const response = await fetch('/api/cash/workspace' + suffix, { cache:'no-store', ...options });
    const result = await response.json();
    if (!response.ok) throw Object.assign(Error(result.error || 'บันทึกไม่สำเร็จ'), { status:response.status, result });
    return result;
  }
  function changed() {
    status('มีการแก้ไข — รอบันทึกเข้าฐานกลาง', 'pending');
    persist({ request:inFlight, current:{...cache}, baseRevision:revision }).catch(() => freeze('เก็บข้อมูลรอบันทึกไม่สำเร็จ กรุณาสำรองก่อนปิดหน้าเว็บ'));
    clearTimeout(timer); timer = setTimeout(flush, 450);
  }
  async function flush() {
    clearTimeout(timer);
    if (running || blocked || !ready) return;
    const changes = differences();
    if (!inFlight && !Object.keys(changes).length) { await persist(null); status('บันทึกในฐานกลางแล้ว · เวอร์ชัน ' + revision); return; }
    running = true;
    try {
      if (!inFlight) inFlight = { revision, requestId:crypto.randomUUID(), clientId, changes };
      await persist({ request:inFlight, current:{...cache} });
      status('กำลังบันทึกเข้าฐานกลาง…', 'pending');
      const result = await api({ method:'PUT', headers:{'Content-Type':'application/json','x-cash-client':'1'}, body:JSON.stringify(inFlight) });
      for (const [key, value] of Object.entries(inFlight.changes)) { if (value === null) delete baseline[key]; else baseline[key] = value; }
      revision = result.revision; inFlight = null;
      await persist(pending() ? { current:{...cache}, baseRevision:revision } : null);
      status(pending() ? 'มีการแก้ไขเพิ่มเติม — รอบันทึก' : 'บันทึกในฐานกลางแล้ว · เวอร์ชัน ' + revision, pending() ? 'pending' : 'normal');
    } catch (error) {
      if (error.status === 409) freeze('มีคนอื่นบันทึกข้อมูลใหม่แล้ว กรุณาสำรองการแก้ไขก่อนโหลดข้อมูลล่าสุด');
      else if (error.status === 400 || error.status === 413) freeze('ข้อมูลยังไม่ถูกบันทึก: ' + error.message + ' กรุณาสำรองเพื่อตรวจแก้');
      else status('ยังไม่ได้บันทึกเข้าฐานกลาง กรุณาลองใหม่หรือสำรองข้อมูล', 'error', 'retry');
    } finally {
      running = false;
      if (!blocked && !inFlight && Object.keys(differences()).length) timer = setTimeout(flush, 450);
    }
  }
  async function initialize() {
    const {own:saved,others:recoveries} = await loadOutbox(), remote = await api();
    if (!remote.storage || !Number.isSafeInteger(remote.revision)) throw Error('ข้อมูลฐานกลางไม่สมบูรณ์');
    cache = {...remote.storage}; baseline = {...remote.storage}; assets = remote.assets; revision = remote.revision;
    const legacy = Object.fromEntries(keys.map(key => [key, original.getItem.call(localStorage, key)]).filter(([, value]) => value !== null));
    bar = document.createElement('div'); bar.className = 'cash-central-status'; bar.setAttribute('data-cash-sync', '');
    const live = document.createElement('span'); live.setAttribute('role','status'); live.setAttribute('aria-live','polite'); bar.append(live);
    for (const [attribute, label, handler] of [
      ['data-retry','ลองอีกครั้ง',()=>flush()],
      ['data-export','สำรองการแก้ไข',()=>exportData(cache,'cash-planning-unsaved.json')],
      ['data-legacy','สำรองข้อมูลเดิมในเครื่อง',()=>exportData(legacy,'cash-planning-browser-before-db.json')],
    ]) { const button = document.createElement('button'); button.type='button'; button.className='secondary'; button.setAttribute(attribute,''); button.textContent=label; button.onclick=handler; button.hidden=attribute==='data-legacy'?!Object.keys(legacy).some(key=>legacy[key]!==baseline[key]):true; bar.append(button); }
    if(recoveries.length){const button=document.createElement('button');button.type='button';button.className='secondary';button.textContent='สำรองรายการรอบันทึกก่อนหน้า';button.onclick=()=>exportData(recoveries,'cash-planning-pending-recovery.json');bar.append(button);}
    document.getElementById('profess-workspace').before(bar);
    Storage.prototype.getItem = function(key) { return this === localStorage && keys.includes(String(key)) ? cache[key] ?? null : original.getItem.call(this, key); };
    Storage.prototype.setItem = function(key, value) {
      key = String(key); value = String(value);
      if (this !== localStorage || !keys.includes(key)) return original.setItem.call(this, key, value);
      if (blocked) throw Error('กรุณาโหลดข้อมูลส่วนกลางล่าสุดก่อนแก้ไข');
      if (cache[key] !== value) { cache[key] = value; changed(); }
    };
    Storage.prototype.removeItem = function(key) {
      key = String(key);
      if (this !== localStorage || !keys.includes(key)) return original.removeItem.call(this, key);
      if (blocked) throw Error('กรุณาโหลดข้อมูลส่วนกลางล่าสุดก่อนแก้ไข');
      if (Object.hasOwn(cache,key)) { delete cache[key]; changed(); }
    };
    Storage.prototype.clear = function() { if (this === localStorage) throw Error('กรุณาสำรองข้อมูลก่อนล้างพื้นที่จัดเก็บ'); return original.clear.call(this); };
    ready = true;
    if (saved) {
      cache = saved.current || cache; inFlight = saved.request || null;
      // Retrying the exact request is safe even after the response was lost.
      if (!inFlight && saved.baseRevision !== revision) freeze('มีข้อมูลรอบันทึกจากครั้งก่อนและฐานกลางเปลี่ยนแล้ว กรุณาสำรองก่อนโหลดล่าสุด');
      else setTimeout(flush, 100);
    } else status('เชื่อมต่อฐานกลางแล้ว · เวอร์ชัน ' + revision);
    window.addEventListener('beforeunload', event => { if (pending() && !intentionalReload) { event.preventDefault(); event.returnValue = ''; } });
    window.addEventListener('online', () => flush());
    setInterval(async () => {
      if (pending() || blocked || running || document.hidden) return;
      try { const latest = await api({}, '?revision=' + revision); if (latest.revision !== revision) freeze('ข้อมูลส่วนกลางมีเวอร์ชันใหม่ กรุณาโหลดล่าสุดก่อนแก้ไข'); }
      catch { status('ติดต่อฐานกลางไม่ได้ — การแก้ไขใหม่จะรอบันทึก', 'error', 'retry'); }
    }, 15000);
  }
  window.CashCentral = { initialize, flush,
    fetchAsset(name) { if (!Object.hasOwn(assets, name)) return Promise.resolve({ok:false}); return Promise.resolve({ok:true,json:async()=>structuredClone(assets[name])}); },
  };
})();
