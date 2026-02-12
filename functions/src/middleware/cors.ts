import type { Request, Response, NextFunction } from "express";

const ALLOWED_HEADERS = "Content-Type, Authorization";
const ALLOWED_METHODS = "GET,POST,OPTIONS";
const DEFAULT_ALLOWED_ORIGINS = [
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
  "http://localhost:3000",
  "http://localhost:5173",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
] as const;

type CorsOptions = {
  allowedOrigins?: readonly string[];
  allowCredentials?: boolean;
};

function setCorsHeaders(
  req: Request,
  res: Response,
  options: CorsOptions = {}
): void {
  const allowlist = new Set(options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS);
  const origin = req.headers.origin as string | undefined;
  if (origin && allowlist.has(origin)) {
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", ALLOWED_METHODS);
  res.setHeader("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  res.setHeader(
    "Access-Control-Allow-Credentials",
    options.allowCredentials ? "true" : "false"
  );
}

function middleware(req: Request, res: Response, next: NextFunction) {
  setCorsHeaders(req, res);
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
  return (req: Request, res: Response) => {
    setCorsHeaders(req, res, options);
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
