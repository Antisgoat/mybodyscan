import { APP_CONFIG } from "@/generated/appConfig";
import { isCapacitorNative } from "@/lib/platform/isNative";

const envSource: Record<string, string | number | boolean | undefined> =
  ((import.meta as any)?.env ?? {}) as Record<string, string | number | boolean | undefined>;

const DEFAULT_PROJECT_ID = "mybodyscan-f3daf";

function readEnv(key: string): string {
  const value = envSource[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

function normalizeUrlBase(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return withProtocol.replace(/\/+$/, "");
  }
}

export function getFunctionsOrigin(): string {
  const native = isCapacitorNative();
  if (!native) {
    return "";
  }

  const configuredOrigin = readEnv("VITE_FUNCTIONS_ORIGIN");
  if (configuredOrigin) {
    const parsed = normalizeUrlBase(configuredOrigin);
    try {
      const url = new URL(parsed);
      return url.origin;
    } catch {
      return parsed;
    }
  }

  const configuredUrl = readEnv("VITE_FUNCTIONS_URL");
  if (configuredUrl) {
    const parsed = normalizeUrlBase(configuredUrl);
    try {
      const url = new URL(parsed);
      return url.origin;
    } catch {
      return parsed;
    }
  }

  const projectId =
    String(APP_CONFIG?.firebase?.projectId || "").trim() ||
    readEnv("VITE_FIREBASE_PROJECT_ID") ||
    readEnv("FIREBASE_PROJECT_ID") ||
    DEFAULT_PROJECT_ID;
  const region = readEnv("VITE_FUNCTIONS_REGION") || "us-central1";

  return `https://${region}-${projectId}.cloudfunctions.net`;
}

export function getFunctionsBaseUrl(): string {
  if (!isCapacitorNative()) return "/api";
  const functionsUrl = readEnv("VITE_FUNCTIONS_URL");
  if (functionsUrl) {
    return normalizeUrlBase(functionsUrl);
  }
  return getFunctionsOrigin();
}

export function urlJoin(base: string, path: string): string {
  const normalizedBase = normalizeUrlBase(base);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}
