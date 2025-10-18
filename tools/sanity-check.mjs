#!/usr/bin/env node
const fetch = global.fetch || (await import('node-fetch').then(m=>m.default)).default;

function env(name, def="") {
  return process.env[name] ?? def;
}

const baseUrl = env("SANITY_BASE_URL", "mybodyscan-f3daf.web.app").replace(/^https?:\/\//,"");
const full = `https://${baseUrl}`;
const out = [];

async function step(name, fn) {
  const start = Date.now();
  try {
    const res = await fn();
    out.push({ name, ok: true, ms: Date.now()-start, info: res });
  } catch (e) {
    out.push({ name, ok: false, ms: Date.now()-start, error: String(e) });
  }
}

await step("GET /system/health", async () => {
  const r = await fetch(`${full}/system/health`, { method: "GET" });
  const text = await r.text();
  return { status: r.status, body: text.slice(0, 400) };
});

await step("GET / (index.html)", async () => {
  const r = await fetch(`${full}/`, { method: "GET" });
  const html = await r.text();
  return { status: r.status, hasDoctype: /^<!doctype html>/i.test(html), size: html.length };
});

// Optional: ping a demo route if present (won’t fail if 404)
await step("GET /demo", async () => {
  const r = await fetch(`${full}/demo`, { method: "GET" });
  return { status: r.status };
}).catch(()=>{});

const summary =
  out.map(o => `- ${o.ok ? "✅":"❌"} ${o.name} (${o.ms}ms)` +
               (o.ok && o.info?.status ? ` status=${o.info.status}` : "")).join("\n");

const payload = {
  baseUrl: full,
  timestamp: new Date().toISOString(),
  results: out,
  summary
};

console.log("===SANITY_JSON_START===");
console.log(JSON.stringify(payload, null, 2));
console.log("===SANITY_JSON_END===");
process.exit(out.some(o => !o.ok) ? 1 : 0);
