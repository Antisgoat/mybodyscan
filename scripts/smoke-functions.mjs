const base =
  process.env.FUNCTIONS_ORIGIN ||
  process.env.VITE_FUNCTIONS_ORIGIN ||
  "https://us-central1-mybodyscan-f3daf.cloudfunctions.net";

const url = new URL('/health', base).toString();
const res = await fetch(url, { method: 'GET' });
if (!res.ok) {
  console.error('[smoke:functions] request failed', res.status, url);
  process.exit(1);
}
const json = await res.json().catch(() => null);
if (!json || json.ok !== true || typeof json.time !== 'string' || typeof json.region !== 'string') {
  console.error('[smoke:functions] invalid payload', json);
  process.exit(1);
}
console.log('[smoke:functions] ok', { url, region: json.region });
