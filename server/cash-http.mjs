import { timingSafeEqual } from 'node:crypto';
import { cashError, MAX_BYTES } from './cash-model.mjs';
const same = (left, right) => { const a = Buffer.from(left || ''), b = Buffer.from(right || ''); return a.length >= 48 && a.length === b.length && timingSafeEqual(a, b); };
export function createCashHandler({ store, key, allowedOrigins }) {
  if (typeof key !== 'string' || key.length < 48 || !allowedOrigins?.length) throw Error('CASH_BACKEND_NOT_CONFIGURED');
  return async request => {
    const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' };
    const json = (value, status = 200) => Response.json(value, { status, headers });
    try {
      if (!same(request.headers.get('x-cash-backend-key'), key)) throw cashError(401, 'BACKEND_KEY_REQUIRED');
      const url = new URL(request.url);
      if (url.pathname === '/api/cash/health' && request.method === 'GET') { await store.read(-1); return json({ status: 'ready', storage: 'central-postgresql' }); }
      if (url.pathname !== '/api/cash/workspace') throw cashError(404, 'NOT_FOUND');
      if (request.method === 'GET') {
        const revision = url.searchParams.has('revision') ? Number(url.searchParams.get('revision')) : undefined;
        return json(await store.read(revision));
      }
      if (request.method !== 'PUT') return Response.json({ error: 'METHOD_NOT_ALLOWED' }, { status: 405, headers: { ...headers, Allow: 'GET, PUT' } });
      if (!allowedOrigins.includes(request.headers.get('origin')) || request.headers.get('x-cash-client') !== '1') throw cashError(403, 'INVALID_ORIGIN');
      if (!request.headers.get('content-type')?.startsWith('application/json')) throw cashError(415, 'JSON_REQUIRED');
      if (Number(request.headers.get('content-length')) > MAX_BYTES) throw cashError(413, 'BODY_TOO_LARGE');
      const reader = request.body?.getReader();
      if (!reader) throw cashError(400, 'INVALID_JSON');
      let size = 0; const chunks = [];
      while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw cashError(413, 'BODY_TOO_LARGE'); } chunks.push(Buffer.from(chunk.value)); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw cashError(400, 'INVALID_JSON'); }
      return json(await store.write(body));
    } catch (error) { return json({ error: error.status ? error.code : 'CENTRAL_DATABASE_UNAVAILABLE', ...(error.revision ? { revision: error.revision } : {}) }, error.status || 503); }
  };
}
