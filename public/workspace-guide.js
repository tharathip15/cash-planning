const workspaceGuideTopics=[
 {id:'start',title:'เริ่มต้นใช้งาน',subtitle:'จากข้อมูลรายการ สู่ภาพรวมเงินสด',view:'overview',action:'เปิดภาพรวม',steps:[
  'เลือกช่วงวันที่ที่ต้องการวางแผนจากแถบด้านบน',
  'เพิ่มรายการจ่ายและบิลลูกหนี้ หรือใช้ Import Excel นำเข้าข้อมูลเดิม',
  'กรอกเงินต้นช่วงที่หน้าภาพรวม แล้วคลิกการ์ดเพื่อดูรายการประกอบยอด'
 ],notes:'ข้อมูลใช้งานผ่านฐานข้อมูลกลาง ควรส่งออก Excel เพื่อตรวจสอบและสำรองงาน ระบบยังไม่ดึง Statement ธนาคารให้อัตโนมัติ ต้องตรวจยอดก่อนยืนยันรับจริง'},
 {id:'cash',title:'อ่านภาพรวมเงินสด',subtitle:'เงินต้น รับ จ่าย และเงินคงเหลือ',view:'overview',action:'ดูภาพรวมเงินสด',steps:[
  'เงินต้นช่วงคือเงินพร้อมใช้ก่อนเริ่มรับ–จ่ายในวันแรก ห้ามรวมเงินรับที่อยู่ในช่วงแล้ว',
  'ยอดรับหลักรวมเฉพาะ “รับชัวร์” และ “รับแล้ว” เงินรับที่ยังไม่ชัวร์แสดงแยก',
  'ยอดจ่ายรวมทั้งแผนและที่จ่ายแล้ว รวมรายการที่ยังไม่ชัวร์เพื่อสำรองเงิน',
  'เงินปลายช่วง = เงินต้น + ยอดรับหลัก − ยอดจ่าย คลิกการ์ดดูยอดต่อเนื่องรายวัน'
 ],notes:'ยอดช่วงเช้า–บ่ายไม่รวมรายการที่ยังไม่ระบุเวลา และไม่ยืนยันลำดับเงินเข้า–จ่ายภายในช่วงเดียวกัน คำค้นจะกรองทั้งยอดบนการ์ดและรายการประกอบ'},
 {id:'payments',title:'จัดการรายการรับ–จ่าย',subtitle:'เพิ่มรายการ แยกเงินต้น ดอกเบี้ย ประเภท และ BU',view:'list',action:'เปิดรายการจ่าย',steps:[
  'เลือก “เพิ่มรายการ” แล้วกรอกวันที่ รายการ คู่ค้า และยอดเงินในตาราง',
  'รายการจ่ายมีช่องเงินต้น ดอกเบี้ยจ่าย ประเภท BU และเลขที่บัญชี Supplier เมื่อพิมพ์ชื่อเดิม ระบบเสนอเลขจากประวัติ หากมีบัญชีเดียวและชื่อตรงจะเติมให้ ถ้ามีหลายบัญชีหรือชื่อใกล้เคียงให้เลือกเอง',
  'เลือกช่วงเช้า บ่าย หรือยังไม่ระบุเวลา และกำหนดสถานะตามความแน่นอน',
  'เมื่อเงินเข้าหรือจ่ายจริง ให้กดยืนยันและกรอกยอดจริง วันที่ บัญชี และผู้ยืนยัน'
 ],notes:'งบ “ซัพเงินสด” หักตามรายการจ่ายเงินสดของวันเดียวกันอัตโนมัติ เก็บงบตั้งต้นไว้และไม่ลดต่ำกว่า 0 ถ้าเปลี่ยนวันที่ ประเภท หรือยอด ระบบคำนวณใหม่ รายการรับและแผนรับเงิน/ลูกหนี้เลือกพฤติกรรมการจ่ายพร้อมหมายเหตุได้ เก็บกับลูกค้าและใช้ร่วมกันสำหรับบิลที่จับคู่ได้ ในหน้าลูกหนี้กำหนดวันนัดชำระแล้วกดบันทึกแผนรับเพื่อยืนยันการแก้ไข ใช้ยอดคอลัมน์ D คำนวณเงินสด ช่องเงินต้นและดอกเบี้ยเป็นรายละเอียด ไม่บวกซ้ำ การแก้ตารางบันทึกอัตโนมัติ ใช้ Tab ไปช่องถัดไปและ Enter ลงแถวถัดไป รายการยืนยันแล้วล็อกยอดจริง แต่แก้หมายเหตุและรายละเอียดการจ่ายได้'},
 {id:'import',title:'นำเข้า Excel และป้องกันรายการซ้ำ',subtitle:'เลือกไฟล์ จับคู่ ตรวจข้อมูล แล้วยืนยัน',view:'list',action:'ไปหน้านำเข้ารายการจ่าย',steps:[
  'กด “นำเข้า Excel” เลือกไฟล์ .xlsx, .xls หรือ .csv และเลือกชีตที่ต้องการ',
  'ตรวจแถวหัวตารางและจับคู่คอลัมน์ ช่องที่มี * ต้องระบุให้ครบ',
  'อัปโหลดไฟล์เดิมใช้ “ข้ามรายการซ้ำ” หากต้องการแก้รายการเดิม ให้ใช้ “อัปเดตรายการเดิม” พร้อมเลขรายการในทุกแถว',
  'กดตรวจข้อมูล ดูจำนวนเพิ่มใหม่ ข้ามซ้ำ และข้อผิดพลาดก่อนยืนยันนำเข้า'
 ],notes:'เมื่อไม่มีเลขรายการ ระบบเทียบวันที่ คู่ค้า และยอดตามคอลัมน์ที่จับคู่ หากข้อมูลคล้ายกันแต่ยืนยันไม่ได้ ให้ตรวจเลขรายการเดิมก่อนเพิ่ม รายการที่ยืนยันจริงหรือเชื่อมบิลต้องแก้ที่ต้นทาง ข้อมูลรับ/จ่ายจริงจากไฟล์ต้องมีบัญชี ผู้ยืนยัน วันที่ และช่วงเวลา'},
 {id:'calendar',title:'ใช้ปฏิทินรับ–จ่าย',subtitle:'ดูแผนรายวัน พร้อมสรุปสัปดาห์และเดือน',view:'calendar',action:'เปิดปฏิทิน',steps:[
  'เลือกช่วงวันที่ ปฏิทินจะแสดงยอดรับ จ่าย และสุทธิของแต่ละวัน',
  'คลิกวันที่เพื่อดูรายการรับ–จ่ายและสถานะ',
  'ใช้วันก่อน/วันถัดไปเพื่อดูต่อเนื่อง หรือคลิกการ์ดในหน้ารายวันเพื่อดูเฉพาะกลุ่ม'
 ],notes:'วันนอกช่วงที่เลือกไม่รวมในยอด คำค้นมีผลกับรายการและยอดในปฏิทินด้วย'},
 {id:'ar',title:'วางแผนรับและติดตามลูกหนี้',subtitle:'เริ่มจากบิล บันทึกแผน แล้วติดตามงาน',view:'ar-plan',action:'เปิดแผนลูกหนี้',steps:[
  'เพิ่มบิลด้วยฟอร์ม ตาราง Excel หรือดึงจากยอดขายรายบิล',
  'บิลคงค้างจากรายงานจะแสดงอัตโนมัติ · ข้อมูลที่ไม่มีในไฟล์เว้นว่างไว้ ไม่แทนวันนัดด้วยวันครบกำหนด',
  'บิลที่ยังไม่มีวันนัดอยู่ในแท็บรอนัดชำระ บันทึกวันนัดแล้วจะไปรายการรับทั้งหมดเพื่อเช็กยอดกับ Statement',
  'เมื่อเช็ก Statement แล้ว ให้ยืนยันยอดเข้าจริง ระบบจะลดค้างรับของบิลที่เชื่อมและเก็บประวัติการรับ',
  'นำเข้ารายงานรับชำระแล้วเปิดแท็บรับชำระ / ตรวจเทียบ ดูรายการตรงกัน รอตรวจ หรือยอดต่าง โดยไม่สร้างยอดรับซ้ำ',
  'เปิดแจ้งเตือนงานและรายละเอียดบิลเพื่อบันทึกการติดตาม นัดใหม่ และวันที่ส่งหนังสือจริง'
 ],notes:'อายุหนี้ยึดวันครบกำหนดเดิม การเปลี่ยนนัดไม่เริ่มนับใหม่ หนังสือฉบับที่ 2 เริ่มเมื่อฉบับที่ 1 ครบ 15 วัน หรือถึง Day 50 และต้องส่งไม่เกิน Day 55 การแจ้งเตือนตรวจทุกบิลเมื่อเปิดเว็บ ยังไม่ส่งอีเมล หนังสือ หรือระงับขายจริงให้ ต้องบันทึกและเก็บหลักฐานการดำเนินการจริง'},
 {id:'reports',title:'ดูรายงานและอัปเดตข้อมูล',subtitle:'ยอดขาย ยอดค้าง เครดิต และข้อมูลต้นทาง',view:'report-monthly',action:'เปิดรายงานยอดขาย',steps:[
  'เลือกรายงานยอดขายรายเดือน หรือรายชื่อลูกค้าและเครดิต',
  'กรองเดือน บริษัท และลูกค้า หรือค้นหาจากหัวตาราง',
  'คลิกการ์ดหรือยอดในตารางเพื่อดูบิลและวิธีคำนวณวันรับจริง ส่งออก Excel ตามข้อมูลที่เปิดอยู่',
  'รายการรับทั้งหมดแยกตามวันนัดชำระจากแผนรับ · บิลที่ยังไม่นัดอยู่คนละกลุ่ม และกดเลขบิลกลับไปแก้วันนัดได้',
  'สถานะลูกหนี้กำหนดทั้งลูกค้า แยก PF/NV/TNP · กลุ่ม 1–3 ย้ายเฉพาะยอดค้างออกจากตารางรายเดือน โดยเก็บยอดขายเดิมไว้',
  'นำเข้า 3 ไฟล์: ขายเชื่อ ลูกหนี้คงค้าง และรับชำระ · รายงานซ่อนลูกค้าโปรเฟสและทีเอ็นพีในเครือเป็นค่าเริ่มต้น',
   'หน้าเครดิต กด “แก้ไขแบบ Excel” พิมพ์หรือวางหลายช่อง แล้วบันทึก ระบบเก็บเงื่อนไขไว้ใช้ครั้งต่อไป'
 ],notes:'วันที่ส่งของใช้ Doc Date · วันที่บิลใช้ Invoice Date · SO/SS ใช้ Sale Order No แยกกันทุกหน้าและไฟล์ส่งออก จำนวนวันรับจริงนับจากวันที่บิลถึงวันรับชำระ รวมช่วงเครดิตแล้ว เช่น เครดิต 60 วัน รับจริง 95 วัน คือรับหลังเครดิต 35 วัน ไม่บวกเครดิตซ้ำ แสดงผลปัดเป็นวันเต็ม เฉลี่ยถ่วงน้ำหนักตามยอดตัดรับ ใบลดหนี้ไม่ใช่เงินรับ ค่าติดลบคือรับก่อนวันที่บิล เครดิตตามลูกค้าและเงื่อนไขต้องกรอกเองเมื่อไม่มีในไฟล์ รายงานอ้างอิงข้อมูลที่นำเข้าล่าสุด ช่องว่างไม่ถือเป็นเครดิตเงินสด ยอดเงินรวม VAT ตามไฟล์ รายงานที่มีข้อมูลเชื่อมรายบิลจะหักยอดรับจริงหลังวัน snapshot โดยไม่หักซ้ำ การนำเข้าใหม่แทนข้อมูลต้นทางชนิดนั้น ควรตรวจขอบเขตก่อนยืนยัน'},
 {id:'backup',title:'สำรองข้อมูลและแก้ปัญหา',subtitle:'เก็บไฟล์สำรองและตรวจสถานะก่อนปิดหน้า',view:'list',action:'เปิดรายการเพื่อส่งออก',steps:[
  'กดส่งออก Excel จากโมดูลที่ต้องการ: ภาพรวมเป็นสรุปเงินสด ปฏิทินเป็นยอดรายวัน และหน้ารายการส่งออกตามตัวกรอง หากเปิดรายละเอียดการ์ด ให้ใช้ปุ่มส่งออกภายในหน้าต่างนั้น',
  'หากขึ้นข้อความบันทึกไม่สำเร็จ ให้ส่งออกข้อมูลก่อนปิดหน้าเว็บ',
  'ใช้เบราว์เซอร์และเครื่องเดิมเพื่อดูข้อมูลที่บันทึกไว้ ข้อมูลยังไม่ซิงก์ระหว่างผู้ใช้',
  'รายการที่ซ้ำไปแล้วให้เทียบเลขรายการ ยอด วันที่ และหลักฐานก่อนแก้ไข'
 ],notes:'ชื่อผู้ยืนยันเป็นข้อมูลที่ผู้ใช้กรอกเอง ยังไม่มีการตรวจสิทธิ์หรือระบบอนุมัติ ข้อมูลรายงานอาจย้อนกลับชุดก่อนหน้าได้จากเมนูอัปเดตข้อมูล แต่ไม่ได้ย้อนประวัติรับ–จ่ายทั้งหมด'}
];
let workspaceGuideTopic='start',workspaceGuideReturn='overview';
function updateWorkspaceHeader(){
 const subtitles={overview:'เงินพร้อมใช้ และแผนรับ–จ่ายของคุณ',calendar:'ดูยอดรายวันและคลิกเพื่อเปิดรายละเอียด',income:'ดูตามวันนัด เช็ก Statement แล้วยืนยันยอดเข้าจริง',list:'จัดการค่าใช้จ่าย เงินต้น ดอกเบี้ย และ BU','ar-plan':'ลูกหนี้รอนัด นัดแล้ว และตรวจเทียบรายงานรับชำระ','report-monthly':'ดูยอดขายและยอดค้างตามตัวกรอง','report-credit':'ดูเครดิตและเงื่อนไขการชำระของลูกค้า',guide:'วิธีใช้งานและคำตอบที่หาได้ในที่เดียว'};
 const subtitle=document.querySelector('.top p');if(subtitle)subtitle.textContent=subtitles[view]||'จัดการแผนรับ–จ่ายของคุณ';
 const exportButton=document.querySelector('#export');
 const moduleLabels={overview:'ภาพรวม',calendar:'ปฏิทิน',income:'รายการรับทั้งหมด',list:'รายการจ่าย','ar-plan':'ลูกหนี้'};
 if(exportButton){exportButton.textContent='ส่งออก Excel'+(moduleLabels[view]?' · '+moduleLabels[view]:'');exportButton.setAttribute('aria-label',exportButton.textContent)}
}
function openWorkspaceGuide(topic){
 if(view!=='guide')workspaceGuideReturn=view;
 workspaceGuideTopic=topic||({overview:'cash',calendar:'calendar',income:'payments',list:'payments','ar-plan':'ar','report-monthly':'reports','report-credit':'reports'}[view]||'start');
 view='guide';render();
 document.querySelector('aside')?.removeAttribute('data-mobile-open');
 document.querySelector('#nav-toggle')?.setAttribute('aria-expanded','false');
 document.querySelector('#title')?.scrollIntoView({block:'start'});
}
function renderWorkspaceGuide(){
 const orderedTopics=[...workspaceGuideTopics].sort((a,b)=>Number(b.id===workspaceGuideTopic)-Number(a.id===workspaceGuideTopic));
 document.querySelector('main > .toolbar').hidden=true;
 $('#title').textContent='คู่มือการใช้งาน';$('.eyebrow').textContent='PROFESS / HELP CENTER';
 document.querySelectorAll('nav button[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view==='guide'));
 $('#content').innerHTML=`<section class="guide-hero"><div><span class="section-kicker">เริ่มง่าย ใช้งานคล่อง</span><h2>อยากทำอะไรวันนี้?</h2><p>เลือกหัวข้อหรือค้นหาวิธีใช้งานได้ที่นี่</p></div><button class="secondary" id="guide-back">← กลับหน้าทำงาน</button></section><label class="guide-search"><span>ค้นหาในคู่มือ</span><input type="search" id="guide-search" placeholder="เช่น นำเข้า Excel, รายการซ้ำ, BU" autocomplete="off"></label><div class="guide-topics">${orderedTopics.map(topic=>`<details class="guide-topic" id="guide-topic-${topic.id}" ${topic.id===workspaceGuideTopic?'open':''}><summary><span><b>${esc(topic.title)}</b><small>${esc(topic.subtitle)}</small></span><span class="guide-chevron" aria-hidden="true">⌄</span></summary><div class="guide-topic-body"><ol>${topic.steps.map(step=>`<li>${esc(step)}</li>`).join('')}</ol><p class="guide-note">${esc(topic.notes)}</p><button type="button" class="primary" data-guide-view="${topic.view}">${esc(topic.action)} →</button></div></details>`).join('')}</div><p id="guide-empty" class="empty" role="status" hidden>ไม่พบหัวข้อนี้ ลองค้นหาด้วยคำอื่น</p>`;
 $('#guide-back').onclick=()=>{view=workspaceGuideReturn;render()};
 document.querySelectorAll('[data-guide-view]').forEach(button=>button.onclick=()=>{
  view=button.dataset.guideView;
  if(view.startsWith('ar-'))$('#ar-menu').open=true;
  if(view.startsWith('report-'))$('#report-menu').open=true;
  render();document.querySelector('#title').scrollIntoView({block:'start'});
 });
 $('#guide-search').oninput=event=>{
  const words=event.target.value.normalize('NFKC').trim().toLocaleLowerCase('th-TH').split(/\s+/).filter(Boolean);
  let matches=0;
  workspaceGuideTopics.forEach(topic=>{
   const element=$('#guide-topic-'+topic.id),text=[topic.title,topic.subtitle,...topic.steps,topic.notes].join(' ').normalize('NFKC').toLocaleLowerCase('th-TH');
   element.hidden=!words.every(word=>text.includes(word));
   if(!element.hidden){matches++;if(words.length)element.open=true}
  });$('#guide-empty').hidden=matches>0;
 };
}
function workspaceHelpLink(topic,label='วิธีใช้งาน'){return `<button type="button" class="text-help" onclick="openWorkspaceGuide('${topic}')">${label} ↗</button>`}
