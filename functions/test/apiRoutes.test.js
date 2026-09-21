import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

const { apiAppForTest } = await import("../lib/index.js");

function postJson(base, path, body = {}) {
  return fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("api router returns json for legacy workout endpoints on / and /api aliases", async () => {
  const originalFetch = global.fetch;
  const originalProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = "mybodyscan-f3daf";
  const forwarded = [];
  global.fetch = async (url, init) => {
    const u = String(url);
    if (u.startsWith("http://127.0.0.1:")) {
      return originalFetch(url, init);
    }
    forwarded.push(u);
    const fnName = u.split("/").pop();
    return new Response(JSON.stringify({ ok: true, fnName }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const server = http.createServer(apiAppForTest);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  try {
    for (const path of [
      "/getPlan",
      "/api/getPlan",
      "/getWorkouts",
      "/api/getWorkouts",
      "/applyCatalogPlan",
      "/api/applyCatalogPlan",
    ]) {
      const res = await postJson(base, path);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type") || "", /application\/json/);
      const payload = await res.json();
      assert.equal(payload.ok, true);
      assert.ok(payload.data);
    }
    assert.ok(
      forwarded.every((url) =>
        url.startsWith("https://us-central1-mybodyscan-f3daf.cloudfunctions.net/")
      )
    );

    const billing = await postJson(
      base,
      "/api/billing/create-checkout-session",
      { priceId: "price_1TwQ1OQQU5vuhlNj5peGUJbZ", plan: "one" }
    );
    assert.equal(billing.status, 401);
    assert.deepEqual(await billing.json(), {
      error: "auth_required",
      code: "auth_required",
    });
  } finally {
    global.fetch = originalFetch;
    if (originalProject == null) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = originalProject;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("api never reports an HTML upstream page as a successful food write", async () => {
  const originalFetch = global.fetch;
  const originalProject = process.env.GCLOUD_PROJECT;
  process.env.GCLOUD_PROJECT = "mybodyscan-f3daf";
  global.fetch = async (url, init) => {
    if (String(url).startsWith("http://127.0.0.1:")) {
      return originalFetch(url, init);
    }
    return new Response("<html>MyBodyScan</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  };
  const server = http.createServer(apiAppForTest);
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await postJson(base, "/api/addMeal", {
      dateISO: "2026-09-21",
      meal: { name: "Egg" },
    });
    assert.equal(res.status, 502);
    assert.equal((await res.json()).error.code, "upstream_invalid_json");
  } finally {
    global.fetch = originalFetch;
    if (originalProject == null) delete process.env.GCLOUD_PROJECT;
    else process.env.GCLOUD_PROJECT = originalProject;
    await new Promise((resolve) => server.close(resolve));
  }
});

test("api preflight allows every header sent by the native client", async () => {
  const server = http.createServer(apiAppForTest);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const res = await fetch(`${base}/api/coach/chat`, {
      method: "OPTIONS",
      headers: {
        origin: "capacitor://localhost",
        "access-control-request-method": "POST",
        "access-control-request-headers":
          "authorization,content-type,x-firebase-appcheck,x-correlation-id,x-request-id,x-tz-offset-mins",
      },
    });
    assert.equal(res.status, 204);
    assert.equal(
      res.headers.get("access-control-allow-origin"),
      "capacitor://localhost"
    );
    const allowedHeaders = String(
      res.headers.get("access-control-allow-headers") || ""
    ).toLowerCase();
    for (const header of [
      "authorization",
      "content-type",
      "x-firebase-appcheck",
      "x-correlation-id",
      "x-request-id",
      "x-tz-offset-mins",
    ]) {
      assert.match(
        allowedHeaders,
        new RegExp(`(?:^|,\\s*)${header}(?:\\s*,|$)`)
      );
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("deferred WHOOP callback is not publicly exposed", async () => {
  const previous = process.env.APP_CHECK_MODE;
  process.env.APP_CHECK_MODE = "strict";
  const server = http.createServer(apiAppForTest);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const res = await fetch(
      `${base}/api/health/whoop/callback?error=access_denied&state=12345678`,
      { redirect: "manual" }
    );
    assert.equal(res.status, 403);
  } finally {
    if (previous == null) delete process.env.APP_CHECK_MODE;
    else process.env.APP_CHECK_MODE = previous;
    await new Promise((resolve) => server.close(resolve));
  }
});
