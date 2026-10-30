"use client";
import { useEffect } from 'react';
import markup from './screen.json';
const scripts = ["search.js", "workspace-guide.js", "card-actions.js", "cash-calendar.js", "counterparty-fields.js", "app.js", "grid.js", "calendar-detail.js", "ar.js", "ar-sheet.js", "ar-notice.js", "vendor/xlsx.full.min.js", "vendor/jszip.min.js", "export-views.js", "excel-io.js", "reports.js", "reports-import.js", "reports-raw.js", "reports-links.js", "report-details.js", "debtor-status.js", "receivables-sync.js"];
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
    tag.src = '/central-store.js';
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
  useEffect(() => {
    boot().catch(error => {
      console.error(error);
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = 'เชื่อมต่อฐานข้อมูลกลางไม่สำเร็จ ยังไม่เปิดให้แก้ไขข้อมูล กรุณาลองรีเฟรชอีกครั้ง';
      document.getElementById('profess-workspace').inert = true;
      document.body.prepend(message);
    });
  }, []);
  return <div id="profess-workspace" dangerouslySetInnerHTML={{ __html: markup }} />;
}
