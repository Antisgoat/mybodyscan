import { onRequest } from "firebase-functions/v2/https";
import { softAppCheck } from "./middleware/appCheck.js";
import { withCors } from "./middleware/cors.js";

export const health = onRequest(
  { invoker: "public" },
  withCors(async (req, res) => {
    await softAppCheck(req as any);
    res.json({ ok: true, ts: Date.now() });
  })
);
