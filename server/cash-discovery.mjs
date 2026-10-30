const cache = new Map();
export function validateBackend(value, discovered = false) {
  const url = new URL(value);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      !(url.protocol === 'https:' || (!discovered && url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.port === '8792'))) throw Error('INVALID_BACKEND_URL');
  if (discovered && !/^[a-z0-9-]+\.trycloudflare\.com$/.test(url.hostname)) throw Error('INVALID_DISCOVERED_HOST');
  return url;
}
export async function resolveBackend(settings, fetcher = fetch, now = Date.now()) {
  if (!settings.CASH_BACKEND_DISCOVERY_URL) return validateBackend(settings.CASH_BACKEND_URL);
  const lookup = new URL(settings.CASH_BACKEND_DISCOVERY_URL);
  if (lookup.origin !== 'https://edge-config.vercel.com' || lookup.username || lookup.password || lookup.hash ||
      !/^\/ecfg_[a-zA-Z0-9]+\/item\/cashBackendUrl$/.test(lookup.pathname) || !lookup.searchParams.get('token') ||
      [...lookup.searchParams.keys()].some(key => key !== 'token')) throw Error('INVALID_DISCOVERY_CONFIGURATION');
  const entry = cache.get(lookup.href);
  if (entry && now - entry.at < 15000) return new URL(entry.value);
  const response = await fetcher(lookup.href, { cache:'no-store', redirect:'error', signal:AbortSignal.timeout(8000) });
  if (!response.ok) throw Error('BACKEND_DISCOVERY_UNAVAILABLE');
  const url = validateBackend(await response.json(), true);
  cache.set(lookup.href, {at:now,value:url.href});
  return url;
}
