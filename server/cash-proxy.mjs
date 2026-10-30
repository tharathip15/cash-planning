import { MAX_BYTES } from './cash-model.mjs';
import { resolveBackend } from './cash-discovery.mjs';
export async function proxyCash(request, settings = process.env, fetcher = fetch) {
  const fail = (error, status) => Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
  try {
    if ((!settings.CASH_BACKEND_URL && !settings.CASH_BACKEND_DISCOVERY_URL) || !settings.CASH_BACKEND_KEY || settings.CASH_BACKEND_KEY.length < 48) return fail('CENTRAL_BACKEND_NOT_CONFIGURED', 503);
    const source = new URL(request.url);
    if (!['/api/cash/workspace', '/api/cash/health'].includes(source.pathname)) return fail('NOT_FOUND', 404);
    if (!['GET', 'PUT'].includes(request.method)) return fail('METHOD_NOT_ALLOWED', 405);
    const headers = { 'x-cash-backend-key': settings.CASH_BACKEND_KEY, Accept: 'application/json' };
    let body;
    if (request.method === 'PUT') {
      if (request.headers.get('origin') !== source.origin || request.headers.get('x-cash-client') !== '1') return fail('INVALID_ORIGIN', 403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) return fail('JSON_REQUIRED', 415);
      if (Number(request.headers.get('content-length')) > MAX_BYTES) return fail('BODY_TOO_LARGE', 413);
      const reader = request.body?.getReader(), chunks = []; let size = 0;
      if (!reader) return fail('INVALID_JSON', 400);
      while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); return fail('BODY_TOO_LARGE', 413); } chunks.push(Buffer.from(next.value)); }
      body = Buffer.concat(chunks); headers['Content-Type'] = 'application/json';
      headers.origin = request.headers.get('origin'); headers['x-cash-client'] = '1';
    }
    const target = await resolveBackend(settings, fetcher);
    const response = await fetcher(new URL(source.pathname + source.search, target), { method: request.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(45000), cache: 'no-store' });
    if (!response.headers.get('content-type')?.startsWith('application/json')) return fail('INVALID_BACKEND_RESPONSE', 502);
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return fail('CENTRAL_BACKEND_UNAVAILABLE', 503); }
}
