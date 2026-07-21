import { getFunctionsOrigin, urlJoin } from "@/lib/backend/functionsOrigin";
import { isCapacitorNative } from "@/lib/platform/isNative";

const DIRECT_ENDPOINT_MAP: Record<string, string> = {
  "/api/health": "/health",
  "/api/system/health": "/systemHealth",
  "/api/system/bootstrap": "/systemBootstrap",
  "/api/coach/chat": "/coachChat",
  "/api/nutrition/search": "/nutritionSearch",
  "/api/nutrition/barcode": "/nutritionBarcode",
  "/api/nutrition/daily-log": "/getDailyLog",
  "/api/nutrition/history": "/getNutritionHistory",
  "/api/scan/start": "/startScanSession",
  "/api/scan/upload": "/scanUpload",
  "/api/scan/submit": "/submitScan",
  "/api/scan/delete": "/deleteScan",
  "/api/createCheckout": "/createCheckoutHttp",
  "/api/createCustomerPortal": "/createCustomerPortal",
  "/api/account/delete": "/deleteAccount",
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
