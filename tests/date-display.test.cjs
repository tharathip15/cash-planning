const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('public/date-display.js','utf8');
test('day/month/year format preserves ISO dates and rejects invalid calendar days',()=>{
 const c=vm.createContext({window:{},Date});vm.runInContext(source,c);const d=c.window.CashDates;
 assert.equal(d.format('2026-02-19'),'19/02/2026');assert.equal(d.parse('19/02/2026'),'2026-02-19');
 assert.equal(d.format('2026-01-02'),'02/01/2026');assert.equal(d.parse('02/01/2026'),'2026-01-02');
 assert.equal(d.parse('29/02/2024'),'2024-02-29');
 for(const bad of ['29/02/2026','31/04/2026','02/19/2026','1/2/26','00/01/2026','01/13/2026','19/02/2569'])assert.equal(d.parse(bad),'');
 assert.equal(d.format(''),'');assert.equal(d.parse(''),'');
});
test('date presentation adapter keeps original form values and legacy change handlers in ISO',()=>{
 class Element{
  constructor(tag='span'){this.tagName=tag.toUpperCase();this.nodeType=1;this.childNodes=[];this.events={};this.attributes={};this.value='';this.disabled=false;this.readOnly=false;this.min='';this.max=''}
  append(...items){this.childNodes.push(...items);items.forEach(item=>item.parentElement=this)}
  after(wrapper){this.wrapper=wrapper}
  getAttribute(key){return this.attributes[key]??null}setAttribute(key,value){this.attributes[key]=value}
  addEventListener(name,handler){(this.events[name]||=[]).push(handler)}
  dispatchEvent(event){for(const handler of this.events[event.type]||[])handler(event);return true}
  matches(selector){return selector==='input[type=date]'&&this.type==='date'}
  setCustomValidity(message){this.error=message;this.validity={valid:!message}}
  focus(){this.focused=true}
 }
 class Input extends Element{
  constructor(){super('input');this._value='';this.type='date'}
  get value(){return this._value||''}set value(value){this._value=String(value)}
 }
 const input=new Input();input.value='2026-02-19';input.name='actualDate';
 const body=new Element();body.append(input);
 const document={nodeType:9,readyState:'complete',body,childNodes:[body],createElement:tag=>new Element(tag)};
 const c=vm.createContext({window:{},document,HTMLInputElement:Input,Event:class{constructor(type){this.type=type}},MutationObserver:class{observe(){}},queueMicrotask,Date});
 vm.runInContext(source,c);const [text,picker]=input.wrapper.childNodes;assert.equal(text.value,'19/02/2026');assert.equal(input.value,'2026-02-19');assert.equal(input.hidden,true);
 let received;input.addEventListener('change',()=>received=input.value);
 text.value='02/01/2027';text.dispatchEvent({type:'change',stopPropagation(){}});assert.equal(received,'2027-01-02');assert.equal(text.value,'02/01/2027');
 input.value='2028-12-31';assert.equal(text.value,'31/12/2028');
 text.value='31/02/2026';text.dispatchEvent({type:'change',stopPropagation(){}});assert.ok(text.error);assert.equal(input.value,'');assert.equal(received,'2027-01-02');
 text.value='01032026';text.dispatchEvent({type:'change',stopPropagation(){}});assert.equal(input.value,'2026-03-01');assert.equal(text.value,'01/03/2026');
 input.showPicker=()=>input.value='2026-04-25';picker.onclick();assert.equal(text.value,'25/04/2026');
});
