function ioCashRecordSpec(source,name,kind='all'){
 const cols=ioCashColumns(kind).map(([key,label,type])=>({key,label,type:type==='date'?'date':type==='number'?'number':'text'}));
 const rows=source.map(record=>{
  const proof=record.receipt||record.payment||{},outgoing=record.type==='out';
  return {date:record.date,group:groupName(record),party:record.party||'',amount:amount(record),
   principal:outgoing?(record.principal??''):'',interestExpense:outgoing?(record.interestExpense??''):'',
   expenseType:outgoing?(expenseTypes[record.expenseType]||''):'',businessUnit:outgoing?(businessUnits[record.businessUnit]||''):'',
   period:periods[record.period],status:outgoing?payStatuses[record.payStatus]:certainties[record.certainty],note:record.note||'',
   id:String(record.id),planAmount:record.amount,confirmedBy:proof.confirmedBy||'',account:proof.account||'',actualDate:proof.actualDate||'',_type:record.type};
 });
 return {kind,name,cols,rows};
}

function ioCalendarExportSpec(source){
 const cols=[{key:'date',label:'วันที่',type:'date'},...[
  ['income','รับชัวร์ + รับแล้ว'],['expense','แผนจ่าย + จ่ายแล้ว'],['net','รับ − จ่ายสุทธิ'],['uncertain','เงินรับยังไม่ชัวร์'],['count','จำนวนรายการ']
 ].map(([key,label])=>({key,label,type:'number'}))];
 const rows=rangeDates().map(date=>{
  const selected=source.filter(record=>record.date===date),income=mainIncome(selected),expense=sum(selected,'out');
  return {date,income,expense,net:income-expense,uncertain:uncertainIncome(selected),count:selected.length};
 });
 return {kind:'summary',name:'ปฏิทินรับจ่าย',cols,rows};
}

function ioOverviewExportSpec(source,cash){
 const cols=[{key:'section',label:'หมวด',type:'text'},{key:'label',label:'รายการ / วันที่',type:'text'},...[
  ['opening','เงินต้น'],['income','รับในแผนหลัก'],['expense','จ่ายตามแผนและจ่ายแล้ว'],['balance','คงเหลือตามแผน'],['uncertain','เงินรับยังไม่ชัวร์']
 ].map(([key,label])=>({key,label,type:'number'}))];
 const initial=cash===''?null:Number(cash),income=mainIncome(source),expense=sum(source,'out');
 const rows=[{section:'สรุปช่วงวันที่',label:rangeStart+' ถึง '+rangeEnd,opening:initial??'',income,expense,balance:initial===null?'':initial+income-expense,uncertain:uncertainIncome(source)}];
 let balance=initial;
 for(const date of rangeDates()){
  const selected=source.filter(record=>record.date===date),start=balance,income=mainIncome(selected),expense=sum(selected,'out');
  balance=balance===null?null:balance+income-expense;
  rows.push({section:'รายวัน',label:date,opening:start??'',income,expense,balance:balance??'',uncertain:uncertainIncome(selected)});
 }
 for(const [type,category] of [['out','credit'],['out','cash'],['in','credit'],['in','cash'],['out','unset'],['in','unset']]){
  const selected=source.filter(record=>record.type===type&&record.category===category);
  rows.push({section:'แยกประเภท',label:groupName({type,category}),opening:'',income:mainIncome(selected),expense:sum(selected,'out'),balance:'',uncertain:uncertainIncome(selected)});
 }
 return {kind:'summary',name:'ภาพรวมเงินสด',cols,rows};
}

function ioSafeSheetName(name){return String(name).replace(/[\\/?*\[\]:]/g,' ').replace(/^'+|'+$/g,'').trim().slice(0,31)||'ข้อมูล'}
function ioSafeFileName(name){return String(name).replace(/[<>:"/\\|?*]/g,'-').trim()||'ข้อมูล'}
