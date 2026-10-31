"use client";
import { useEffect, useState } from 'react';
import markup from './screen.json';
const scripts = ["search.js", "workspace-guide.js", "card-actions.js", "cash-calendar.js", "counterparty-fields.js", "app.js", "grid.js", "calendar-detail.js", "ar.js", "ar-sheet.js", "ar-notice.js", "vendor/xlsx.full.min.js", "vendor/jszip.min.js", "export-views.js", "excel-io.js", "reports.js", "reports-import.js", "reports-raw.js", "reports-links.js", "report-details.js", "debtor-status.js", "receivables-sync.js", "table-layout.js", "date-display.js"];
// Legacy modules own this DOM subtree; React must not update its contents.
let bootPromise;
async function seedCurrentWorkspace() {
  const keys = ['profess-reports-v1', 'profess-edits-v2', 'profess-added-v1', 'profess-ar-v1', 'profess-source-ar-edits-v1'];
  if (keys.some(key => localStorage.getItem(key) !== null)) return;
  const response = await fetch('/workspace-snapshot.json');
  if (!response.ok) throw new Error('Cannot load current workspace data');
  const snapshot = await response.json();
  const written = [];
  try {
    for (const [key, value] of Object.entries(snapshot.storage)) {
      if (!key.startsWith('profess-') || localStorage.getItem(key) !== null) continue;
      localStorage.setItem(key, value);
      written.push(key);
    }
  } catch (error) {
    for (const key of written) localStorage.removeItem(key);
    throw error;
  }
}
function boot() {
  if (!bootPromise) bootPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    const testMode = ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname) && new URLSearchParams(window.location.search).get('mode') === 'test';
    tag.src = testMode ? '/test-store.js' : '/central-store.js';
    tag.onload = resolve;
    tag.onerror = () => reject(new Error('Cannot load central database connection'));
    document.body.appendChild(tag);
  }).then(() => window.CashCentral.initialize()).then(() => scripts.reduce((pending, src) => pending.then(() =>
    new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = '/' + src;
      tag.async = false;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error('Cannot load ' + src));
      document.body.appendChild(tag);
    })
  ), Promise.resolve()));
  return bootPromise;
}
export default function CashWorkspace() {
  const [connectionError, setConnectionError] = useState(null);
  useEffect(() => {
    let active = true;
    boot().catch(error => {
      console.error(error);
      document.getElementById('profess-workspace').inert = true;
      if (active) setConnectionError(error.message);
    });
    return () => { active = false; };
  }, []);
  return <>
    {connectionError && <section className="workspace-connection-error" role="alert">
      <div className="workspace-recovery-card">
        <span className="workspace-recovery-brand">PROFESS · CASH PLANNING</span>
        <h1>ยังเชื่อมต่อข้อมูลกลางไม่ได้</h1>
        <p>{connectionError === 'CENTRAL_BACKEND_NOT_CONFIGURED'
          ? 'เว็บในเครื่องนี้ยังไม่ได้ตั้งค่าการเชื่อมต่อฐานข้อมูลกลาง จึงยังเปิดตารางและเมนูทำงานไม่ได้'
          : 'ระบบยังโหลดข้อมูลกลางไม่สำเร็จ จึงหยุดการแก้ไขไว้ก่อน กรุณาลองเชื่อมต่อใหม่'}</p>
        <p>ข้อมูลเดิมไม่ได้ถูกลบ หากต้องการทำงานต่อ สามารถเปิดเว็บออนไลน์ได้</p>
        <div className="workspace-recovery-actions">
          {typeof window !== 'undefined' && ['127.0.0.1', 'localhost', '[::1]'].includes(window.location.hostname) && <a href="/?mode=test">เปิดโหมดทดสอบในเครื่อง</a>}
          <a href="https://cash-planning-mu.vercel.app/">เปิดเว็บออนไลน์</a>
          <button type="button" onClick={() => window.location.reload()}>ลองเชื่อมต่ออีกครั้ง</button>
        </div>
        <small>เว็บออนไลน์อาจแสดงหน้าตาต่างจากเวอร์ชันที่กำลังปรับในเครื่องนี้</small>
      </div>
    </section>}
    <div id="profess-workspace" hidden={connectionError !== null} dangerouslySetInnerHTML={{ __html: markup }} />
  </>;
}
