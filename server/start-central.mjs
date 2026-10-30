import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { database, verifyDatabase, createStore } from './cash-store.mjs';
import { createCashHandler } from './cash-http.mjs';

const settingsPath = process.argv[2];
if (!settingsPath) throw Error('CASH_PRIVATE_SETTINGS_REQUIRED');
const settings = JSON.parse(await readFile(settingsPath, 'utf8'));
if (settings.port !== 8792) throw Error('CASH_LOOPBACK_PORT_REQUIRED');
const sql = database(settings.databaseUrl);
const identity = await verifyDatabase(sql);
if (identity.role !== 'pfig_cash_app') throw Error('CASH_RUNTIME_ROLE_REQUIRED');
const handler = createCashHandler({ store: createStore(sql), key: settings.backendKey, allowedOrigins: settings.allowedOrigins });
const server = createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(new URL(incoming.url, 'http://127.0.0.1:8792'), {
      method: incoming.method, headers: incoming.headers,
      ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
    });
    const response = await handler(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch { outgoing.writeHead(503, { 'Cache-Control': 'no-store' }); outgoing.end(); }
});
server.requestTimeout = 60000; server.headersTimeout = 10000;
server.listen(8792, '127.0.0.1', () => console.log('Cash Planning central backend ready on loopback 8792'));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await sql.end(); process.exit(); }));
