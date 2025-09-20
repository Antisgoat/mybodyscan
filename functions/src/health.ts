import { onRequest } from "firebase-functions/v2/https";
import { softVerifyAppCheck } from "./middleware/appCheck.js";
import { withCors } from "./middleware/cors.js";

export const health = onRequest(
  withCors(async (req, res) => {
    await softVerifyAppCheck(req as any, res as any);
    res.json({ ok: true, ts: Date.now() });
  })
);
