const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
function setup(storage={}){
 const c=vm.createContext({console,Map,Set,localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v},arInvoices:[],data:[],esc:v=>String(v).replaceAll('"','&quot;'),document:{querySelector:()=>null}});
 vm.runInContext(fs.readFileSync('public/counterparty-fields.js','utf8'),c);return c;
}
test('matches normalized supplier names and offers all distinct accounts while preserving leading zeros',()=>{
 const c=setup(),records=[{id:1,type:'out',party:'บริษัท เอ บี จำกัด',bankAccount:'001-2-34567-8'},
  {id:2,type:'out',party:'เอ บี',bankAccount:'0012345678'},
  {id:3,type:'out',party:'เอ บี',bankAccount:'0099999999'},
  {id:4,type:'out',party:'เอ บี',payment:{account:'บริษัทจ่ายจากบัญชีนี้'}}];
 const found=c.supplierAccountSuggestions('เอ บี',records,9);
 assert.equal(found.length,2);assert.equal(found[0].account,'001-2-34567-8');
 assert.equal(c.supplierAccountSuggestions('เอ บี',[records[0]],1).length,0);
 assert.equal(c.normalizeBankAccount('001-2-34567-8'),'001-2-34567-8');
 assert.throws(()=>c.normalizeBankAccount('<script>'),/เลขที่บัญชี/);
});
test('similar names are suggestions, never automatically treated as exact matches',()=>{
 const c=setup(),found=c.supplierAccountSuggestions('Acme Tradng',[{id:1,type:'out',party:'Acme Trading',bankAccount:'0001'}],2);
 assert.equal(found.length,1);assert.equal(found[0].exact,false);
});
test('only a unique exact account fills a blank field; changing the name clears an automatic choice',()=>{
 const c=setup(),input={value:'',getAttribute:()=> 'options'},list={innerHTML:''},hint={textContent:''};
 c.document={querySelector:selector=>selector.includes('data-bank-suggestion')?hint:input,getElementById:()=>list};
 const row={id:3,type:'out',party:'Acme',bankAccount:''};c.data=[{id:1,type:'out',party:'Acme',bankAccount:'0010'},row];
 c.updateSupplierAccountSuggestions(row);assert.equal(row.bankAccount,'0010');
 row.party='Another';c.updateSupplierAccountSuggestions(row);assert.equal(row.bankAccount,'');
 row.party='Acme';c.data.push({id:2,type:'out',party:'Acme',bankAccount:'0020'});
 c.updateSupplierAccountSuggestions(row);assert.equal(row.bankAccount,'');assert.match(hint.textContent,/2 บัญชี/);
 row.bankAccount='0099';c.updateSupplierAccountSuggestions(row);assert.equal(row.bankAccount,'0099');
});
test('customer behavior is shared between a linked income and invoice and survives reload',()=>{
 const storage={},c=setup(storage),invoice={id:'ar1',sourceCompany:'โปรเฟส',sourceCustomerCode:'C1',customer:'Acme',amount:100,dueDate:'2026-11-01'};
 c.arInvoices=[invoice];const receipt={id:1,type:'in',party:'Acme',arInvoiceId:'ar1',certainty:'received',amount:100};
 c.setCustomerBehavior(receipt,'paymentBehavior','จ่ายตามดิว');c.setCustomerBehavior(receipt,'behaviorNote','จ่ายทุกวันที่ 15');
 assert.equal(c.customerBehavior(invoice,'ar').paymentBehavior,'on_due');
 assert.equal(invoice.dueDate,'2026-11-01');assert.equal(receipt.certainty,'received');assert.equal(receipt.amount,100);
 const next=setup(storage);assert.equal(next.customerBehavior(invoice,'ar').behaviorNote,'จ่ายทุกวันที่ 15');
});
test('different companies and ambiguous customer names do not share behavior',()=>{
 const c=setup(),a={id:'a',sourceCompany:'โปรเฟส',sourceCustomerCode:'C1',customer:'Acme'},b={...a,id:'b',sourceCompany:'Novat'};
 c.arInvoices=[a,b];c.setCustomerBehavior(a,'paymentBehavior','early','ar');
 assert.equal(c.customerBehavior(b,'ar').paymentBehavior,'');
 assert.equal(c.customerBehavior({id:1,party:'Acme'}).paymentBehavior,'');
});
test('AR drafts retain their own edits until saved, and unsupported behavior is rejected',()=>{
 const c=setup(),draft={id:'ar1',customer:'Acme',paymentBehavior:'on_promise',behaviorNote:'โทรก่อนวันนัด',behaviorTouched:true};
 assert.equal(c.customerBehavior({id:1,party:'Acme'}).paymentBehavior,'');
 c.saveCustomerBehaviorEdits([draft]);
 assert.equal(c.customerBehavior({id:1,party:'Acme'}).paymentBehavior,'on_promise');
 assert.equal(draft.behaviorTouched,undefined);
 assert.throws(()=>c.normalizePaymentBehavior('อะไรก็ได้'),/ไม่อยู่/);
});

test('renaming a manual income counterparty does not carry the previous customer habit',()=>{
 const c=setup(),row={id:1,party:'Acme'};c.setCustomerBehavior(row,'paymentBehavior','early');
 row.party='Another Customer';assert.equal(c.customerBehavior(row).paymentBehavior,'');
});

test('AR sheet renders behavior and notes using the shared customer profile',()=>{
 const c=setup();Object.assign(c,{periods:{unset:'ยังไม่ระบุ'},certainties:{uncertain:'ยังไม่ชัวร์'},arFields:[],arInvoiceInRange:()=>true,arInvoiceMatch:()=>true,arDate:String,arDefault:()=>'',arOutstanding:()=>100,money:String});
 const grid=fs.readFileSync('public/grid.js','utf8');vm.runInContext(grid.slice(0,grid.indexOf('let pasteBatch=')),c);
 const sheet=fs.readFileSync('public/ar-sheet.js','utf8');vm.runInContext(sheet.slice(0,sheet.indexOf('document.body.insertAdjacentHTML')),c);
 const bill={id:'ar1',sourceCompany:'โปรเฟส',sourceCustomerCode:'C1',customer:'Acme',amount:100};c.arInvoices=[bill];
 c.setCustomerBehavior(bill,'paymentBehavior','usually_late','ar');
 const html=c.arSheetHTML([bill]);assert.match(html,/data-ar-sheet-key="paymentBehavior"/);assert.match(html,/value="usually_late" selected/);assert.match(html,/data-ar-sheet-key="behaviorNote"/);
});
