import type { Request } from "firebase-functions/v2/https";
import type { Response } from "express";
import { getAllowedOrigins } from "../lib/env.js";

const STATIC_ALLOWED = new Set([
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
]);

function buildAllowedOrigins(): Set<string> {
  const dynamic = new Set(getAllowedOrigins());
  return new Set<string>([...STATIC_ALLOWED, ...dynamic]);
}

export function withCors(handler: (req: Request, res: Response) => Promise<void> | void) {
  return async (req: Request, res: Response): Promise<void> => {
    const origin = req.headers.origin as string | undefined;
    const allowed = buildAllowedOrigins();
    const originAllowed = origin ? allowed.has(origin) : false;

    if (origin) {
      res.setHeader("Vary", "Origin");
      if (originAllowed) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
        res.setHeader(
          "Access-Control-Allow-Headers",
          "Content-Type,Authorization,X-Firebase-AppCheck,X-TZ-Offset-Mins"
        );
        res.setHeader("Access-Control-Allow-Credentials", "false");
        if (req.method === "OPTIONS") {
          res.status(204).end();
          return;
        }
      } else {
        res.status(403).json({
          error: "origin_not_allowed",
          message: "Requests must originate from an approved domain.",
          origin,
          allowedOrigins: Array.from(allowed),
        });
        return;
      }
    } else if (req.method === "OPTIONS") {
      res.status(403).json({
        error: "origin_missing",
        message: "Requests must include an Origin header from an approved domain.",
      });
      return;
    }

    await handler(req, res);
  };
}
