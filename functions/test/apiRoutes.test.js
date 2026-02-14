import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const { apiAppForTest } = await import('../lib/index.js');

function postJson(base, path) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({})
  });
}

test('api router supports /getPlan and /api/getPlan', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("http://127.0.0.1:")) {
      return originalFetch(url, init);
    }
    const fnName = u.split('/').pop();
    return new Response(JSON.stringify({ fnName }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };

  const server = http.createServer(apiAppForTest);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  try {
    for (const path of ['/getPlan', '/api/getPlan', '/applyCatalogPlan', '/api/applyCatalogPlan']) {
      const res = await postJson(base, path);
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type') || '', /application\/json/);
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.ok(payload.data);
    }
  } finally {
    global.fetch = originalFetch;
    await new Promise((resolve) => server.close(resolve));
  }
});
