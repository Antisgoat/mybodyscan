import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhoopAuthorizationUrl,
  getWhoopReadiness,
  normalizeWhoopRecovery,
} from "../lib/health/whoop.js";

test("WHOOP remains unavailable until every server credential is present", () => {
  assert.deepEqual(getWhoopReadiness({}), {
    configured: false,
    reason: "missing_client_id",
  });
  assert.deepEqual(
    getWhoopReadiness({
      WHOOP_CLIENT_ID: "client",
      WHOOP_CLIENT_SECRET: "secret",
      WHOOP_REDIRECT_URI: "https://mybodyscanapp.com/api/health/whoop/callback",
    }),
    { configured: true, reason: "ready" }
  );
});

test("WHOOP authorization uses read-only recovery scopes and CSRF state", () => {
  const url = new URL(
    buildWhoopAuthorizationUrl({
      clientId: "client-id",
      redirectUri: "https://mybodyscanapp.com/api/health/whoop/callback",
      state: "12345678",
    })
  );
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "12345678");
  const scope = url.searchParams.get("scope") || "";
  assert.match(scope, /offline/);
  assert.match(scope, /read:recovery/);
  assert.match(scope, /read:sleep/);
  assert.doesNotMatch(scope, /write:/);
});

test("WHOOP recovery normalization keeps only coaching-relevant numeric fields", () => {
  assert.deepEqual(
    normalizeWhoopRecovery(
      {
        score: {
          recovery_score: 82,
          resting_heart_rate: 51,
          hrv_rmssd_milli: 67.4,
          skin_temp_celsius: 33.2,
        },
      },
      "2026-08-09"
    ),
    {
      date: "2026-08-09",
      recoveryScore: 82,
      restingHeartRate: 51,
      hrvRmssdMs: 67.4,
      source: "whoop",
    }
  );
});
