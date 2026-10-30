"use client";
import { useEffect } from 'react';
import markup from './screen.json';
const scripts = ["search.js", "workspace-guide.js", "card-actions.js", "cash-calendar.js", "counterparty-fields.js", "app.js", "grid.js", "calendar-detail.js", "ar.js", "ar-sheet.js", "ar-notice.js", "vendor/xlsx.full.min.js", "vendor/jszip.min.js", "export-views.js", "excel-io.js", "reports.js", "reports-import.js", "reports-raw.js", "reports-links.js", "report-details.js", "debtor-status.js", "receivables-sync.js"];
// Legacy modules own this DOM subtree; React must not update its contents.
let bootPromise;
function boot() {
  if (!bootPromise) bootPromise = scripts.reduce((pending, src) => pending.then(() =>
    new Promise((resolve, reject) => {
      const tag = document.createElement('script');
      tag.src = '/' + src;
      tag.async = false;
      tag.onload = resolve;
      tag.onerror = () => reject(new Error('Cannot load ' + src));
      document.body.appendChild(tag);
    })
  ), Promise.resolve());
  return bootPromise;
}
export default function CashWorkspace() {
  useEffect(() => {
    boot().catch(error => {
      console.error(error);
      const message = document.createElement('p');
      message.setAttribute('role', 'alert');
      message.textContent = 'โหลดระบบไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ';
      document.body.prepend(message);
    });
  }, []);
  return <div id="profess-workspace" dangerouslySetInnerHTML={{ __html: markup }} />;
}
