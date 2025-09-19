import { onRequest } from "firebase-functions/v2/https";

export const health = onRequest((_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});
