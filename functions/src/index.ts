import { onRequest } from "firebase-functions/v2/https";

// health: returns ok:true
export const health = onRequest({ cors: true }, async (_req, res) => {
  try {
    res.set("Cache-Control", "no-store");
    res.status(200).json({ ok: true, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: (e as Error).message });
  }
});
