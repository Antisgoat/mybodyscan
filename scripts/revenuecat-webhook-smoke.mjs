import { createHmac } from "node:crypto";

// Usage:
//   node scripts/revenuecat-webhook-smoke.mjs \
//     --url "https://<your-host>/api/revenuecat/webhook" \
//     --secret "<signing-secret>" \
//     --uid "<firebase-uid>" \
//     --eventId "test-evt-1"
//
// Sends a minimal RevenueCat-style payload with an HMAC signature header.

function arg(name, fallback = "") {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const v = process.argv[idx + 1];
  return typeof v === "string" ? v : fallback;
}

const url = arg("url");
const secret = arg("secret");
const uid = arg("uid", "test_uid");
const eventId = arg("eventId", `test-${Date.now()}`);
const entitlementId = arg("entitlementId", "pro");

if (!url || !secret) {
  console.error("Missing --url or --secret");
  process.exit(2);
}

const payload = {
  event: {
    id: eventId,
    type: "INITIAL_PURCHASE",
    app_user_id: uid,
    entitlement_ids: [entitlementId],
    expiration_at_ms: Date.now() + 7 * 24 * 60 * 60 * 1000,
  },
};

const body = Buffer.from(JSON.stringify(payload), "utf8");
const sig = createHmac("sha256", secret).update(body).digest("base64");

const res = await fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-RevenueCat-Signature": sig,
  },
  body,
});

const text = await res.text().catch(() => "");
console.log(JSON.stringify({ status: res.status, ok: res.ok, body: text }, null, 2));

