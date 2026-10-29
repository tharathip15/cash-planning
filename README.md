# Profess — Next.js

## เริ่มใช้งาน
Node.js 20.9 ขึ้นไป
```bash
npm install
npm run dev
```
เปิด http://localhost:3000

Production:
```bash
npm run build
npm start
```

## ขอบเขต
ย้ายระบบล่าสุดเข้า Next.js App Router โดยคงโมดูล JavaScript ที่แก้ DOM เดิมไว้ใน Client Component ไม่ใช่การเขียนทุกโมดูลใหม่เป็น React hooks และไม่ใช้ iframe ไม่ได้เปลี่ยนเว็บที่เผยแพร่อยู่

มีภาพรวม ปฏิทินรายละเอียดรายวัน ตารางรับ/จ่าย แผนรับเงิน/ลูกหนี้ popup ตาม policy ค้นหาตามหัวตาราง เลือกช่วงวัน และ Import/Export Excel พร้อมสี

## โครงสร้างและจุดเชื่อมระบบ
- app/page.jsx และ app/layout.jsx: หน้าเริ่มต้นและ metadata
- app/globals.css: รูปแบบเดิม
- components/CashWorkspace.jsx: โหลดโมดูลตามลำดับ
- components/screen.json: markup คงที่จาก source ห้ามแทนด้วย HTML จากผู้ใช้
- public/app.js: fetch data.json และ save()/localStorage เป็นจุดเปลี่ยนไปใช้ API ฐานข้อมูล; ฟอร์ม receipt/payment ยืนยันยอดจริง
- public/grid.js: ตารางรับ/จ่าย
- public/calendar-detail.js: รายละเอียดปฏิทิน
- public/ar.js: syncAllArPlans(), arPaid(), arOutstanding() เชื่อมบิล แผนรับ และยอดรับจริง
- public/ar-sheet.js: arCommitSheet() ตรวจและ commit ลูกหนี้
- public/ar-notice.js: popup แจ้งเตือนเมื่อเปิดเว็บ
- public/search.js: ค้นหาแต่ละหัวตาราง
- public/excel-io.js: ioBuildPlan()/ioCommit() ตรวจและนำเข้า Excel รวมส่งออกพร้อมสี
- public/data.json: ข้อมูลเริ่มต้นเดิม
- public/vendor/: SheetJS และ JSZip พร้อม license

## การเชื่อมระบบจริง
ยังไม่มี API routes, database, login, สิทธิ์ AR/AP, Odoo, ธนาคาร หรือการส่งหนังสือจริง ควรเพิ่ม server validation, authentication และ audit log ก่อนใช้ร่วมกันในองค์กร การแจ้งเตือนเมื่อปิดเว็บต้องมี server scheduler เพิ่ม

ข้อมูลที่คีย์อยู่ localStorage แต่ละเบราว์เซอร์และ origin จึงไม่ย้ายจากเว็บเดิมมาที่ localhost อัตโนมัติ ให้ Export จากเว็บเดิมแล้ว Import ที่เว็บใหม่ ไม่ได้บรรจุ localStorage ของผู้ใช้ลงในชุดนี้

public/data.json มีข้อมูลตั้งต้นเดิม หากเผยแพร่สาธารณะให้ตรวจหรือเปลี่ยนไฟล์นี้ก่อน

## การพัฒนาต่อ
โมดูลเดิมใช้ globals และ listeners หน้า root นี้ต้อง mount ครั้งเดียว หากเพิ่ม Next client navigation เข้าออกหน้านี้ ต้องเพิ่ม cleanup/module lifecycle ก่อน เมื่อแก้ bootstrap หรือ scripts ให้รีเฟรชเต็มหน้า

เก็บ package-lock.json หลังติดตั้งเพื่อให้ทีมใช้เวอร์ชันตรงกัน ดู VALIDATION.md สำหรับผลตรวจจริง

เอกสาร: https://nextjs.org/docs/app/getting-started/installation
