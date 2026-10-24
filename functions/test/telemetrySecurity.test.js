import assert from "node:assert/strict";
import test from "node:test";
import { handleTelemetryHttp } from "../lib/http/telemetry.js";
import {
  diagnosticText,
  diagnosticExtra,
} from "../lib/system/telemetryPrivacy.js";

test("diagnostics strip URL credentials, tokens and image payloads", () => {
  assert.equal(
    diagnosticText(
      "https://user:pass@example.com/photo?token=private#secret",
      500
    ),
    "https://example.com/photo"
  );
  assert.equal(diagnosticText("Bearer abc.def.ghi", 100), "Bearer [redacted]");
  assert.equal(
    diagnosticText("data:image/jpeg;base64,abcdef", 100),
    "[image redacted]"
  );
  assert.deepEqual(
    diagnosticExtra({
      accessToken: "private",
      nested: { email: "member@example.com", count: 2 },
    }),
    {
      accessToken: "[redacted]",
      nested: { email: "[redacted]", count: 2 },
    }
  );
});

test("diagnostics bound nested values and discard prototype keys", () => {
  const value = JSON.parse('{"__proto__":{"polluted":true},"ok":true}');
  assert.deepEqual(diagnosticExtra(value), { ok: true });
  assert.equal(diagnosticExtra(Array(100).fill("x")).length, 10);
});

function request() {
  return {
    method: "POST",
    headers: {},
    body: { kind: "test", message: "test" },
    get: () => undefined,
  };
}
function response() {
  return {
    code: null,
    ended: false,
    setHeader() {},
    status(code) {
      this.code = code;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test("anonymous telemetry is acknowledged without any rate-limit or event writes", async () => {
  const res = response();
  let calls = 0;
  await handleTelemetryHttp(request(), res, {
    identifyUid: async () => null,
    ensureRateLimit: async () => {
      calls++;
      throw new Error("must not run");
    },
  });
  assert.equal(calls, 0);
  assert.equal(res.code, 204);
  assert.equal(res.ended, true);
});

test("telemetry fails closed when its limiter is unavailable", async () => {
  const res = response();
  await handleTelemetryHttp(request(), res, {
    identifyUid: async () => "member",
    ensureRateLimit: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(res.code, 204);
  assert.equal(res.ended, true);
});

test("rate-limited telemetry is silently dropped", async () => {
  const res = response();
  await handleTelemetryHttp(request(), res, {
    identifyUid: async () => "member",
    ensureRateLimit: async () => ({ allowed: false, retryAfterSeconds: 60 }),
  });
  assert.equal(res.code, 204);
  assert.equal(res.ended, true);
});
