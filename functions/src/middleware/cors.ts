import type { Request, Response, NextFunction } from "express";

const UNIVERSAL_ALLOWED_HEADERS =
  "Authorization, Content-Type, X-Firebase-AppCheck, X-Requested-With";
const WRAPPED_ALLOWED_HEADERS =
  "Content-Type,Authorization,X-Firebase-AppCheck,X-TZ-Offset-Mins";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
  // Local dev + preview
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  // iOS wrappers / WebViews (Capacitor/Ionic)
  "capacitor://localhost",
  "ionic://localhost",
] as const;

type CorsOptions = {
  allowedOrigins?: readonly string[];
  allowCredentials?: boolean;
};

function applyUniversal(res: Response) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", UNIVERSAL_ALLOWED_HEADERS);
}

function middleware(req: Request, res: Response, next: NextFunction) {
  applyUniversal(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

function wrapHandler<T extends (req: Request, res: Response) => unknown>(
  handler: T,
  options: CorsOptions = {}
) {
  const allowlist = new Set(options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS);
  const allowCredentials = options.allowCredentials ?? false;

  return (req: Request, res: Response) => {
    const origin = req.headers.origin as string | undefined;
    if (origin && allowlist.has(origin)) {
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", WRAPPED_ALLOWED_HEADERS);
      res.setHeader(
        "Access-Control-Allow-Credentials",
        allowCredentials ? "true" : "false"
      );
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return undefined as ReturnType<T>;
    }

    return handler(req, res);
  };
}

export function withCors(req: Request, res: Response, next: NextFunction): void;
export function withCors<T extends (req: Request, res: Response) => unknown>(
  handler: T,
  options?: CorsOptions
): (req: Request, res: Response) => ReturnType<T>;
export function withCors(
  reqOrHandler: Request | ((req: Request, res: Response) => unknown),
  resOrOptions?: Response | CorsOptions,
  next?: NextFunction
) {
  if (typeof reqOrHandler === "function") {
    return wrapHandler(
      reqOrHandler,
      (resOrOptions as CorsOptions | undefined) ?? {}
    );
  }

  return middleware(
    reqOrHandler,
    resOrOptions as Response,
    next as NextFunction
  );
}
