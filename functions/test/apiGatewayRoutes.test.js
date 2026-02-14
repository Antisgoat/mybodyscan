import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

process.env.ALLOW_MOCK_AUTH = "true";

const { apiApp } = await import("../lib/index.js");

function listen() {
  return new Promise((resolve) => {
    const server = http.createServer(apiApp);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        server,
        baseUrl: `http://127.0.0.1:${addr.port}`,
      });
    });
  });
}

test("api health returns json", async () => {
  const { server, baseUrl } = await listen();
  try {
    const res = await fetch(`${baseUrl}/health`, { method: "POST" });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") || "", /application\/json/);
    const body = await res.json();
    assert.equal(body.ok, true);
  } finally {
    server.close();
  }
});

test("api workouts routes require auth", async () => {
  const { server, baseUrl } = await listen();
  try {
    for (const path of ["/getPlan", "/getWorkouts", "/applyCatalogPlan"]) {
      const res = await fetch(`${baseUrl}${path}`, { method: "POST" });
      assert.equal(res.status, 401);
      const body = await res.json();
      assert.equal(body.code, "unauthenticated");
    }
  } finally {
    server.close();
  }
});

test("api forwards authenticated requests", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const { server, baseUrl } = await listen();
  try {
    const res = await fetch(`${baseUrl}/getPlan`, {
      method: "POST",
      headers: {
        "x-mock-auth-uid": "test-user",
        "x-correlation-id": "corr-test",
      },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  } finally {
    global.fetch = originalFetch;
    server.close();
  }
});
