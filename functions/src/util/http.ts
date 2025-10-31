import type { Request, Response } from "express";

const ALLOWED_ORIGINS = new Set([
  "https://mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
]);

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

function applyCors(res: Response): boolean {
  const req = (res as Response & { req?: Request }).req;
  const method = req?.method ?? "";
  const origin = typeof req?.headers?.origin === "string" ? req.headers.origin : undefined;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-Firebase-AppCheck,X-UAT",
  );
  res.setHeader("Vary", "Origin");

  if (method === "OPTIONS") {
    res.status(204).end();
    return true;
  }

  return false;
}

export function send(res: Response, status: number, body: unknown): void {
  const ended = applyCors(res);
  if (ended) {
    return;
  }

  res.status(status);

  if (body === null || body === undefined) {
    res.end();
    return;
  }

  if (typeof body === "object") {
    res.json(body);
    return;
  }

  res.send(String(body));
}
