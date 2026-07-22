import { createHmac } from "node:crypto";

// Usage:
//   node scripts/revenuecat-webhook-smoke.mjs \
//     --url "https://<your-host>/api/revenuecat/webhook" \
//     --secret "<signing-secret>" \
//     --eventId "test-evt-1"
//
// Sends a non-billing RevenueCat-style TEST payload with an HMAC signature.
// The webhook records an ignored audit event but cannot grant Pro or credits.
// Real purchase testing must be performed through StoreKit/TestFlight.

function arg(name, fallback = "") {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return fallback;
  const v = process.argv[idx + 1];
  return typeof v === "string" ? v : fallback;
}

const url = arg("url");
const secret = arg("secret");
const uid = arg("uid", "webhook_smoke_test");
const eventId = arg("eventId", `test-${Date.now()}`);

if (!url || !secret) {
  console.error("Missing --url or --secret");
  process.exit(2);
}

const payload = {
  event: {
    id: eventId,
    type: "TEST",
    app_user_id: uid,
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
