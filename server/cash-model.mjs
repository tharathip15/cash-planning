import { createHash } from 'node:crypto';

export const SHARED_KEYS = Object.freeze([
  'profess-reports-v1', 'profess-reports-backup-v1', 'profess-added-v1',
  'profess-edits-v2', 'profess-ar-v1', 'profess-ar-sheet-v1',
  'profess-source-ar-edits-v1', 'profess-debtor-status-v1', 'profess-customer-behavior-v1',
]);
export const MAX_BYTES = 4_000_000;
export function cashError(status, code) { return Object.assign(new Error(code), { status, code }); }
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function decodeReport(text) {
  const report = JSON.parse(text);
  if (report?.schema !== 1 || !Array.isArray(report.monthly?.rows) || !Array.isArray(report.credit?.rows)) throw cashError(400, 'INVALID_REPORT');
  for (const source of Object.values(report.rawSources || {})) {
    if (!source.table) continue;
    const { columns, rows } = source.table;
    if (!Array.isArray(columns) || !Array.isArray(rows)) throw cashError(400, 'INVALID_SOURCE');
    source.rows = rows.map(row => Object.fromEntries(columns.flatMap((column, index) => {
      const value = row[index];
      if (value == null) return [];
      if (!column || typeof column.key !== 'string' || ['__proto__', 'constructor', 'prototype'].includes(column.key)) throw cashError(400, 'INVALID_COLUMN');
      if (column.dictionary && (!Number.isInteger(value) || value < 0 || value >= column.dictionary.length)) throw cashError(400, 'INVALID_DICTIONARY');
      return [[column.key, column.dictionary ? column.dictionary[value] : value]];
    })));
    delete source.table;
  }
  return report;
}
export function validateStorage(storage) {
  if (!object(storage) || Object.keys(storage).some(key => !SHARED_KEYS.includes(key))) throw cashError(400, 'INVALID_STORAGE_KEY');
  if (Buffer.byteLength(JSON.stringify(storage)) > MAX_BYTES) throw cashError(413, 'WORKSPACE_TOO_LARGE');
  for (const [key, value] of Object.entries(storage)) {
    if (typeof value !== 'string') throw cashError(400, 'INVALID_STORAGE_VALUE');
    let parsed;
    try { parsed = JSON.parse(value); } catch { throw cashError(400, 'INVALID_JSON_VALUE'); }
    if (key === 'profess-reports-v1' || key === 'profess-reports-backup-v1') decodeReport(value);
    else if (['profess-added-v1', 'profess-ar-v1'].includes(key)) { if (!Array.isArray(parsed)) throw cashError(400, 'ARRAY_REQUIRED'); }
    else if (!object(parsed)) throw cashError(400, 'OBJECT_REQUIRED');
  }
  if (!storage['profess-reports-v1']) throw cashError(400, 'REPORT_REQUIRED');
  return storage;
}
export function validateMutation(body) {
  const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
  if (!object(body) || Object.keys(body).some(key => !['revision', 'requestId', 'clientId', 'changes'].includes(key)) ||
      !Number.isSafeInteger(body.revision) || body.revision < 1 || !uuid.test(body.requestId) || !uuid.test(body.clientId) || !object(body.changes)) throw cashError(400, 'INVALID_MUTATION');
  const keys = Object.keys(body.changes);
  if (!keys.length || keys.some(key => !SHARED_KEYS.includes(key)) || Object.values(body.changes).some(value => value !== null && typeof value !== 'string')) throw cashError(400, 'INVALID_CHANGES');
  if (Buffer.byteLength(JSON.stringify(body)) > MAX_BYTES) throw cashError(413, 'WORKSPACE_TOO_LARGE');
  return body;
}
export function mergeStorage(before, changes) {
  const next = { ...before };
  for (const [key, value] of Object.entries(changes)) { if (value === null) delete next[key]; else next[key] = value; }
  return validateStorage(next);
}
const text = value => String(value ?? '').trim();
function money(value) { const n = Number(value); if (value == null || value === '' || !Number.isFinite(n) || Math.abs(n) >= 1e15) throw cashError(400, 'INVALID_MONEY'); return n; }
export function buildProjection(storage, baseCash) {
  const report = decodeReport(storage['profess-reports-v1']);
  const companies = new Map(), customers = new Map();
  const company = name => { const code = text(name); if (!code) throw cashError(400, 'COMPANY_REQUIRED'); companies.set(code, { code, name: code }); return code; };
  for (const row of report.credit.rows) {
    const item = { company: company(row[1]), customer_code: text(row[2]), name: text(row[3]), details: row };
    const key = JSON.stringify([item.company, item.customer_code]);
    if (!item.customer_code || customers.has(key)) throw cashError(400, 'DUPLICATE_CUSTOMER');
    customers.set(key, item);
  }
  const makeRows = (kind, valueKey) => (report.rawSources?.[kind]?.rows || []).map((row, index) => ({
    source_row: index + 1, company: company(row.company), customer_code: text(row.code), bill_no: text(row.bill),
    document_date: text(row.date || row.receivedDate), amount: money(row[valueKey]), details: row,
  }));
  const sales = makeRows('sales', 'amount'), receivables = makeRows('ar', 'balance'), receipts = makeRows('receipts', 'received');
  const billKeys = new Set();
  for (const row of receivables) {
    const key = JSON.stringify([row.company, row.customer_code, row.bill_no]);
    if (!row.bill_no || !row.customer_code || billKeys.has(key)) throw cashError(400, 'DUPLICATE_RECEIVABLE');
    billKeys.add(key);
  }
  const edits = JSON.parse(storage['profess-edits-v2'] || '{}'), added = JSON.parse(storage['profess-added-v1'] || '[]');
  const cash = [...baseCash.map(row => ({ ...row, ...(edits[row.id] || {}) })), ...added];
  const ids = new Set();
  const cashEntries = cash.map(row => {
    const id = text(row.id);
    if (!id || ids.has(id) || !['in', 'out'].includes(row.type)) throw cashError(400, 'INVALID_CASH_ENTRY');
    ids.add(id);
    return { id, document_date: text(row.date), type: row.type, amount: money(row.amount), details: row };
  });
  return { companies: [...companies.values()], customers: [...customers.values()], sales, receivables, receipts, cashEntries };
}
