import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";

const ALLOWED = new Set([
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
]);

export function withCors(handler: (req: Request, res: Response) => Promise<void> | void) {
  return async (req: Request, res: Response): Promise<void> => {
    const origin = req.headers.origin as string | undefined;
    if (origin && ALLOWED.has(origin)) {
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,Authorization,X-Firebase-AppCheck,X-TZ-Offset-Mins"
      );
      res.setHeader("Access-Control-Allow-Credentials", "false");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    await handler(req, res);
  };
}
