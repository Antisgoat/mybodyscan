import { getFunctionsOrigin, urlJoin } from "@/lib/backend/functionsOrigin";
import { isCapacitorNative } from "@/lib/platform/isNative";

const DIRECT_ENDPOINT_MAP: Record<string, string> = {
  "/api/health": "/health",
  "/api/system/health": "/systemHealth",
  "/api/system/bootstrap": "/systemBootstrap",
  // Coach and nutrition expose ordinary JSON routes through the aggregate
  // `api` HTTP function. Do not point native fetches at their standalone
  // callable functions: callable endpoints require a `{ data: ... }` envelope
  // and reject normal REST payloads before the application handler runs.
  "/api/coach/chat": "/api/coach/chat",
  "/api/nutrition/search": "/api/nutrition/search",
  "/api/nutrition/barcode": "/api/nutrition/barcode",
  "/api/nutrition/daily-log": "/api/nutrition/daily-log",
  "/api/nutrition/history": "/api/nutrition/history",
  "/api/scan/start": "/startScanSession",
  "/api/scan/upload": "/scanUpload",
  "/api/scan/submit": "/submitScan",
  "/api/scan/delete": "/deleteScan",
  "/api/createCheckout": "/createCheckoutHttp",
  "/api/createCustomerPortal": "/createCustomerPortal",
  "/api/account/delete": "/deleteAccount",
  // Legacy callers of the retrying HTTP client omit `/api`.
  "/system/health": "/systemHealth",
  "/system/bootstrap": "/systemBootstrap",
  "/coach/chat": "/api/coach/chat",
};

function splitPathAndQuery(path: string): { pathOnly: string; query: string } {
  const [pathOnly, ...rest] = path.split("?");
  return { pathOnly, query: rest.length ? `?${rest.join("?")}` : "" };
}

export function resolveEndpoint(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;

  const normalized = path.startsWith("/") ? path : `/${path}`;
  const { pathOnly, query } = splitPathAndQuery(normalized);
  const native = isCapacitorNative();

  if (!native) {
    return normalized;
  }

  const mapped = DIRECT_ENDPOINT_MAP[pathOnly] || pathOnly;
  return urlJoin(getFunctionsOrigin(), `${mapped}${query}`);
}
