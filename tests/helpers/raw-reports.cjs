const fs = require('node:fs');
const vm = require('node:vm');
const XLSX = require('../../public/vendor/xlsx.full.min.js');

function rawReportRuntime() {
 const context = vm.createContext({ console, Date, Intl, structuredClone, XLSX, money: String, esc: String, $: () => ({ value: '', disabled: true, innerHTML: '' }) });
 for (const file of ['grid.js', 'reports-import.js', 'excel-io.js', 'reports-raw.js', 'report-details.js']) {
  const text = fs.readFileSync('public/' + file, 'utf8');
  const end = file === 'report-details.js' ? -1 : file === 'grid.js' ? text.indexOf('let pasteBatch=') : text.indexOf('document.body.insertAdjacentHTML');
  vm.runInContext(end<0?text:text.slice(0, end), context);
 }
 return { context, XLSX,
  schemas: vm.runInContext('rrSchemas', context),
  setInput(kind, input) { context.testInput = input; context.testKind = kind; vm.runInContext('rrInputs[testKind]=testInput', context); },
 };
}
module.exports = { rawReportRuntime };
