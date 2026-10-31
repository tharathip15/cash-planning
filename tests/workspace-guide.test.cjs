const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function setup() {
 const elements = new Map();
 const get = key => {
  if (!elements.has(key)) elements.set(key, { hidden: false, open: false, textContent: '', innerHTML: '', setAttribute() {}, removeAttribute() {}, scrollIntoView() {} });
  return elements.get(key);
 };
 const context = vm.createContext({
  view: 'list', console, esc: String, $: get,
  document: { querySelector: get, querySelectorAll: () => [] },
 });
 vm.runInContext(fs.readFileSync('public/workspace-guide.js', 'utf8'), context);
 context.render = () => { if (context.view === 'guide') context.renderWorkspaceGuide(); };
 return { context, get };
}

test('contextual help opens the relevant section and returns to the previous workspace', () => {
 const { context, get } = setup();
 context.openWorkspaceGuide();
 assert.equal(context.view, 'guide');
 assert.equal(get('main > .toolbar').hidden, true);
 assert.match(get('#content').innerHTML, /id="guide-topic-payments" open/);
 get('#guide-back').onclick();
 assert.equal(context.view, 'list');
});

test('guide search finds instructions, opens matches and handles no results', () => {
 const { context, get } = setup();
 context.openWorkspaceGuide('start');
 get('#guide-search').oninput({ target: { value: 'รายการซ้ำ' } });
 assert.equal(get('#guide-topic-import').hidden, false);
 assert.equal(get('#guide-topic-import').open, true);
 assert.equal(get('#guide-topic-calendar').hidden, true);
 assert.equal(get('#guide-empty').hidden, true);
 get('#guide-search').oninput({ target: { value: 'nonexistent-topic-123' } });
 assert.equal(get('#guide-empty').hidden, false);
 get('#guide-search').oninput({ target: { value: '' } });
 assert.equal(get('#guide-topic-calendar').hidden, false);
});
test('calendar help opens its dedicated topic and returns to the originating calendar',()=>{
 for(const view of ['ar-calendar','report-calendar']){
  const {context,get}=setup();context.view=view;context.openWorkspaceGuide();assert.ok(get('#content').innerHTML.includes('id="guide-topic-'+view+'" open'));get('#guide-back').onclick();assert.equal(context.view,view);
 }
});
test('guide searches find calendar date ranges, priority hearts, cost breakdowns and the updated navigation',()=>{
 const {context,get}=setup();context.openWorkspaceGuide('start');
 for(const [query,id]of [['ภาพรวมเงินสด','start'],['ต้นทุนขาย','calendar'],['ช่วงวันที่ หัวปฏิทิน','ar-calendar'],['🩷','ar-calendar'],['Invoice Date','report-calendar'],['ส่งออก Excel ปฏิทิน','report-calendar']]){
  get('#guide-search').oninput({target:{value:query}});assert.equal(get('#guide-topic-'+id).hidden,false,query);
 }
});
