/* Automatic, local workbook matching. No model service or remote file access. */
const reportStoreKey='profess-reports-v1',reportBackupKey='profess-reports-backup-v1';
const reportNorm=v=>String(v??'').normalize('NFKC').toLowerCase().replace(/[\s\u200b·()（）.*_\-/]/g,'');
const reportMonthAbbr=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
function reportSerializeSnapshot(snapshot){
 if(!snapshot?.rawSources)return JSON.stringify(snapshot);
 const rawSources={};
 for(let [kind,source]of Object.entries(snapshot.rawSources)){
  const rows=source.rows||[],keys=[...new Set(rows.flatMap(Object.keys))];
  const columns=keys.map(key=>{
   const values=rows.map(r=>r[key]??null),strings=values.every(v=>v===null||typeof v==='string');
   if(!strings)return {key};
   const dictionary=[...new Set(values.filter(v=>v!==null))],indices=new Map(dictionary.map((v,i)=>[v,i]));
   return JSON.stringify(dictionary).length+JSON.stringify(values.map(v=>v===null?null:indices.get(v))).length<JSON.stringify(values).length?{key,dictionary}:{key};
  });
  const indices=columns.map(c=>c.dictionary?new Map(c.dictionary.map((v,i)=>[v,i])):null);
  rawSources[kind]={...source,rows:undefined,table:{columns,rows:rows.map(r=>columns.map((c,i)=>r[c.key]==null?null:indices[i]?indices[i].get(r[c.key]):r[c.key]))}};
 }
 return JSON.stringify({...snapshot,rawSources});
}
function reportDeserializeSnapshot(text){
 const snapshot=JSON.parse(text);if(!snapshot?.rawSources)return snapshot;
 for(let source of Object.values(snapshot.rawSources))if(source.table){
  const {columns,rows}=source.table;
  source.rows=rows.map(row=>Object.fromEntries(columns.flatMap((c,i)=>row[i]===null?[]:[[c.key,c.dictionary?c.dictionary[row[i]]:row[i]]])));
  delete source.table;
 }
 return snapshot;
}
function reportStored(){try{let d=reportDeserializeSnapshot(localStorage.getItem(reportStoreKey)||'null');return d?.schema===1&&d.monthly?.rows?.length&&d.credit?.rows?.length&&d.monthly?.months?.length?d:null}catch{return null}}
function reportFindSheet(book,name){let exact=book.SheetNames.find(n=>reportNorm(n)===reportNorm(name));if(exact)return book.Sheets[exact];throw Error('ไม่พบชีต “'+name+'” กรุณาใช้ไฟล์ที่มีทั้งสองชีตรายงาน')}
function reportGrid(sheet){return XLSX.utils.sheet_to_json(sheet,{header:1,defval:null,raw:true,blankrows:true})}
function reportHeader(grid,aliases){let best=null;for(let r=0;r<Math.min(40,grid.length);r++){let map=aliases.map(names=>grid[r].findIndex(v=>names.some(n=>reportNorm(v)===reportNorm(n))));if(map.every(i=>i>=0)){best={row:r,map};break}}if(!best)throw Error('หัวตารางไม่ครบ กรุณาตรวจรหัสลูกค้า บริษัท ลูกค้า และหัวข้อที่จำเป็น');return best}
function reportNumber(v,where){if(v===null||v===undefined||v==='')return 0;if(typeof v==='number'&&Number.isFinite(v))return v;let s=String(v).replace(/[,\s฿]/g,'').replace(/^\((.*)\)$/,'-$1');if(!/^-?\d+(\.\d+)?$/.test(s))throw Error(where+' ต้องเป็นตัวเลข');return Number(s)}
function reportCell(sheet,r,c){let cell=sheet[XLSX.utils.encode_cell({r,c})];if(cell?.f&&(cell.v===undefined||cell.v===null||cell.t==='e'))throw Error('สูตรที่ '+XLSX.utils.encode_cell({r,c})+' ไม่มีผลคำนวณ กรุณาเปิด Excel คำนวณแล้วบันทึกไฟล์ก่อน');if(cell?.t==='e')throw Error('พบสูตรผิดพลาดที่ '+XLSX.utils.encode_cell({r,c}));return cell?.v??null}
function reportMonthKey(v,year){let n=Number(v);if(Number.isInteger(n)&&n>=250001&&n<=270012&&n%100>=1&&n%100<=12)return String(n);let s=String(v??'');let i=reportMonthAbbr.findIndex(m=>reportNorm(s).startsWith(reportNorm(m)));if(i<0)return null;let match=s.match(/(?:25\d{2}|\b\d{2}\b)/);let y=match?Number(match[0]):year;if(y<100)y+=2500;return String(y)+String(i+1).padStart(2,'0')}
const reportMonthlyAliases=[['ที่','ลำดับ'],['บริษัท'],['รหัสลูกค้า','Customer No'],['ชื่อฝ่ายขาย','Emp Name'],['ลูกค้า','ชื่อลูกค้า','Customer Name'],['ประเภท','ประเภทลูกค้า'],['เครดิต','เครดิต (วัน)'],['จำนวนวันรับเงินจริง','จำนวนวันรับเฉลี่ย']];
const reportCreditAliases=[['ที่','ลำดับ'],['บริษัท'],['รหัสลูกค้า','Customer No'],['ลูกค้า','ชื่อลูกค้า','Customer Name'],['ประเภทลูกค้า','ประเภท'],['เครดิต (วัน)','เครดิต'],['กลุ่มเครดิต (เดิม)'],['ยอดค้างรวม (บาท)','ยอดค้างรวม'],['เครดิตตามเงื่อนไขลูกค้า (วัน)'],['เงื่อนไขการชำระเงิน (ตามเงื่อนไขลูกค้)','เงื่อนไขการชำระเงิน (ตามเงื่อนไขลูกค้า)'],['ผลเทียบกับเครดิตเดิม'],['รูปแบบการจ่าย (จากไฟล์ Report)'],['กลุ่มเครดิต (ตามลูกค้า)']];
function reportParseMonthly(sheet,year){
 let grid=reportGrid(sheet),header=reportHeader(grid,reportMonthlyAliases),months=[],seen=new Set();
 for(let c=0;c<(grid[header.row]?.length||0);c++){
  let label=String(grid[header.row][c]??''),code=reportMonthKey(grid[header.row-1]?.[c],year)||reportMonthKey(label,year);
  if(!code||seen.has(code))continue;
  let sales=-1,debt=-1;
  if(label.includes('ยอดขาย')||label.includes('ยอดค้าง')){
   for(let j=0;j<grid[header.row].length;j++){let l=String(grid[header.row][j]??'');if(reportMonthKey(l,year)===code){if(l.includes('ยอดขาย'))sales=j;if(l.includes('ยอดค้าง'))debt=j}}
  }else{
   if(String(grid[header.row+1]?.[c]).includes('ยอดขาย')&&String(grid[header.row+1]?.[c+1]).includes('ยอดค้าง')){sales=c;debt=c+1}
  }
  if(sales<0||debt<0)throw Error('ไม่พบคู่ยอดขาย / ยอดค้างของเดือน '+code);
  seen.add(code);months.push({key:code,label:reportMonthAbbr[Number(code.slice(-2))-1]+' '+code.slice(2,4),sourceSales:sales,sourceDebt:debt});
 }
 months.sort((a,b)=>a.key.localeCompare(b.key));if(!months.length)throw Error('ไม่พบคอลัมน์ยอดขายและยอดค้างรายเดือน');
 let rows=[],keys=new Set();for(let r=header.row+1;r<grid.length;r++){
  let raw=grid[r],company=raw[header.map[1]],code=raw[header.map[2]],name=raw[header.map[4]];
  if(code===null||code===undefined||code==='')continue;
  if(!company||!name)throw Error('แถว '+(r+1)+' บริษัทหรือชื่อลูกค้าไม่ครบ');
  let key=String(company).trim()+'|'+String(code).trim();if(keys.has(key))throw Error('รหัสลูกค้าซ้ำในบริษัทเดียวกัน แถว '+(r+1));keys.add(key);
  let row=header.map.map(c=>reportCell(sheet,r,c));row[0]=rows.length+1;
  for(let m of months){row.push(reportNumber(reportCell(sheet,r,m.sourceSales),'ยอดขายแถว '+(r+1)),reportNumber(reportCell(sheet,r,m.sourceDebt),'ยอดค้างแถว '+(r+1)))}
  row.push(months.reduce((n,_,i)=>n+row[8+i*2],0),months.reduce((n,_,i)=>n+row[9+i*2],0));rows.push(row);
 }
 if(!rows.length)throw Error('ชีตยอดขาย-ค้างรายเดือนไม่มีข้อมูลลูกค้า');
 let columns=header.map.map((_,i)=>({key:'c'+i,label:reportMonthlyAliases[i][0],type:i===0?'number':'text'}));
 months=months.map((m,i)=>{columns.push({key:'c'+(8+i*2),label:m.label+' · ยอดขาย',type:'number'},{key:'c'+(9+i*2),label:m.label+' · ยอดค้าง',type:'number'});return {key:m.key,label:m.label,sales:8+i*2,outstanding:9+i*2}});
 columns.push({key:'c'+columns.length,label:'รวมยอดขาย',type:'number'},{key:'c'+(columns.length+1),label:'รวมยอดค้าง',type:'number'});
 return {columns,months,rows,note:'ยอดค้าง = คงเหลือตามไฟล์ที่นำเข้า แยกตามเดือนเอกสาร ไม่ใช่ยอดค้าง ณ สิ้นเดือนย้อนหลัง · เก็บยอดใบลดหนี้ติดลบตามต้นทาง'};
}
function reportParseCredit(sheet){let grid=reportGrid(sheet),h=reportHeader(grid,reportCreditAliases),rows=[],keys=new Set();for(let r=h.row+1;r<grid.length;r++){let code=grid[r][h.map[2]];if(code===null||code===undefined||code==='')continue;let row=h.map.map(c=>reportCell(sheet,r,c));if(!row[1]||!row[3])throw Error('รายชื่อลูกค้าแถว '+(r+1)+' ข้อมูลไม่ครบ');let key=String(row[1]).trim()+'|'+String(row[2]).trim();if(keys.has(key))throw Error('รายชื่อลูกค้าซ้ำ แถว '+(r+1));keys.add(key);row[0]=rows.length+1;row[7]=reportNumber(row[7],'ยอดค้างแถว '+(r+1));rows.push(row)}if(!rows.length)throw Error('ชีตรายชื่อลูกค้าและเครดิตไม่มีข้อมูล');return {columns:reportCreditAliases.map((a,i)=>({key:'c'+i,label:a[0],type:[0,7].includes(i)?'number':'text'})),rows,note:'เครดิตเดิมเทียบเครดิตตามลูกค้าจากไฟล์นำเข้า · ช่องว่างคงเดิม ไม่แปลงเป็นเงินสด · ยอดค้างอาจต่างจากรายงานรายเดือนตามข้อมูลต้นทาง'}}
function reportParseWorkbook(book,filename){let year=reportData?.year||2569,names=book.SheetNames.map(reportNorm),hasMonthly=names.includes(reportNorm('ยอดขาย-ค้างรายเดือน')),hasCredit=names.includes(reportNorm('รายชื่อลูกค้าและเครดิต'));if(!hasMonthly&&!hasCredit)throw Error('ไม่พบชีตยอดขาย-ค้างรายเดือนหรือรายชื่อลูกค้าและเครดิต');if((!hasMonthly||!hasCredit)&&!reportData)throw Error('ยังไม่มีรายงานอีกชุดให้คงไว้');let now=new Date().toISOString(),monthly=hasMonthly?reportParseMonthly(reportFindSheet(book,'ยอดขาย-ค้างรายเดือน'),year):reportData.monthly,credit=hasCredit?reportParseCredit(reportFindSheet(book,'รายชื่อลูกค้าและเครดิต')):reportData.credit;for(let [kind,yes,d]of [['monthly',hasMonthly,monthly],['credit',hasCredit,credit]])if(yes){d.source=filename;d.updatedAt=now;d.year=kind==='monthly'?Number(monthly.months[0].key.slice(0,4)):year}return {...reportData,schema:1,source:filename,year:monthly.year||year,monthly,credit,updatedAt:now,updatedReports:[hasMonthly?'monthly':null,hasCredit?'credit':null].filter(Boolean)}}

function reportResetStates(){for(let kind of ['monthly','credit'])for(let key in reportState[kind])reportState[kind][key]=key==='includeAffiliates'?false:key==='query'?'':key==='from'?reportData.monthly.months[0].key:key==='to'?reportData.monthly.months.at(-1).key:'all'}
function reportApplySnapshot(next){let previous=reportSerializeSnapshot(reportData),serialized=reportSerializeSnapshot(next);if(serialized.length>3000000)throw Error('ข้อมูลเกินขนาดที่บันทึกในเบราว์เซอร์ได้');const backup=localStorage.getItem(reportBackupKey),stored=localStorage.getItem(reportStoreKey);try{localStorage.setItem(reportBackupKey,previous);localStorage.setItem(reportStoreKey,serialized)}catch(error){for(let [key,value]of [[reportBackupKey,backup],[reportStoreKey,stored]]){if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value)}throw error}reportData=next;if(typeof syncSourceReceivables==='function')syncSourceReceivables(next);reportResetStates();reportRender()}
let reportAutoBusy=false;
async function reportAutoImport(file){if(!file||reportAutoBusy)return;reportAutoBusy=true;let status=$('#report-auto-status');try{if(status)status.textContent='กำลังอ่าน จับคู่หัวตาราง และตรวจข้อมูล…';if(!/\.(xlsx|xls)$/i.test(file.name))throw Error('กรุณาเลือกไฟล์ .xlsx หรือ .xls ที่มีชีตรายงานที่ต้องการอัปเดต');if(file.size>15*1024*1024)throw Error('ไฟล์ต้องไม่เกิน 15 MB');let book=XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:true,sheetRows:20001});for(let name of book.SheetNames.filter(n=>[reportNorm('ยอดขาย-ค้างรายเดือน'),reportNorm('รายชื่อลูกค้าและเครดิต')].includes(reportNorm(n)))){let sheet=book.Sheets[name];if(sheet['!fullref']&&XLSX.utils.decode_range(sheet['!fullref']).e.r>=20000)throw Error('ชีตมีข้อมูลเกิน 20,000 แถว')}let next=reportParseWorkbook(book,file.name);reportApplySnapshot(next);$('#report-auto-status').textContent='อัปเดตสำเร็จ: '+next.updatedReports.map(k=>k==='monthly'?'ยอดขาย-ค้างรายเดือน':'รายชื่อลูกค้าและเครดิต').join(' / ')+' · คงรายงานอื่นไว้ · ย้อนกลับชุดก่อนหน้าได้'}catch(e){let target=$('#report-auto-status');if(target)target.textContent='ยังไม่อัปเดตข้อมูลเดิม: '+e.message}finally{reportAutoBusy=false;let input=$('#report-auto-file');if(input)input.value=''}}
function reportBindAuto(){let button=$('#report-auto-open');if(button)button.onclick=()=>$('#report-auto-file').click();let undo=$('#report-auto-undo');if(undo)undo.onclick=()=>{try{let old=reportDeserializeSnapshot(localStorage.getItem(reportBackupKey)||'null');if(!old)throw Error('ไม่มีชุดก่อนหน้า');old.schema=1;reportApplySnapshot(old);$('#report-auto-status').textContent='ย้อนกลับข้อมูลชุดก่อนหน้าแล้ว'}catch(e){$('#report-auto-status').textContent=e.message}}}
document.body.insertAdjacentHTML('beforeend','<input id="report-auto-file" type="file" accept=".xlsx,.xls" hidden aria-label="ไฟล์อัปเดตรายงานอัตโนมัติ">');
$('#report-auto-file').onchange=e=>reportAutoImport(e.target.files[0]);
