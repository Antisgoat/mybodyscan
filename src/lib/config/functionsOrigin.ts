import { getFirebaseConfig } from "@/lib/firebase/config";

const envSource: Record<string, string | number | boolean | undefined> =
  ((import.meta as any)?.env ?? {}) as Record<string, string | number | boolean | undefined>;

function readEnv(key: string): string {
  const value = envSource[key];
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  return "";
}

export function normalizeUrlBase(raw: string): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    const pathname = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${pathname}`;
  } catch {
    return withProtocol.replace(/\/+$/, "");
  }
}

export function urlJoin(base: string, path: string): string {
  const normalizedBase = normalizeUrlBase(base);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!normalizedBase) return normalizedPath;
  return `${normalizedBase}${normalizedPath}`;
}

export function getFunctionsProjectId(): string {
  const firebaseConfig = getFirebaseConfig();
  const fromFirebase = String(firebaseConfig?.projectId || "").trim();
  if (fromFirebase) return fromFirebase;
  return readEnv("VITE_FIREBASE_PROJECT_ID") || readEnv("FIREBASE_PROJECT_ID");
}

export function getFunctionsRegion(): string {
  return readEnv("VITE_FUNCTIONS_REGION") || "us-central1";
}

function toFunctionsOriginFromUrl(urlLike: string): string {
  const normalized = normalizeUrlBase(urlLike);
  if (!normalized) return "";
  try {
    const parsed = new URL(normalized);
    const firstSegment = parsed.pathname.split("/").filter(Boolean)[0] || "";
    if (firstSegment && /^[a-zA-Z0-9-]+$/.test(firstSegment)) {
      return `${parsed.origin}`;
    }
    return parsed.origin;
  } catch {
    return normalized;
  }
}

export function getFunctionsBaseUrl(): string {
  const functionsUrl = readEnv("VITE_FUNCTIONS_URL");
  if (functionsUrl) {
    return normalizeUrlBase(functionsUrl);
  }
  return getFunctionsOrigin();
}

export function getFunctionsOrigin(): string {
  const functionsUrl = readEnv("VITE_FUNCTIONS_URL");
  if (functionsUrl) {
    return toFunctionsOriginFromUrl(functionsUrl);
  }

  const functionsOrigin =
    readEnv("VITE_FUNCTIONS_ORIGIN") || readEnv("VITE_FUNCTIONS_BASE_URL");
  if (functionsOrigin) {
    return toFunctionsOriginFromUrl(functionsOrigin);
  }

  const projectId = getFunctionsProjectId();
  if (!projectId) return "";
  const region = getFunctionsRegion();
  return `https://${region}-${projectId}.cloudfunctions.net`;
}

export async function functionsReachable(timeoutMs = 2500): Promise<boolean> {
  const origin = getFunctionsOrigin();
  const projectId = getFunctionsProjectId();
  if (!origin) return false;
  const endpoint = urlJoin(origin, "/health");
  if (import.meta.env.DEV) {
    console.info("[functions] reachability probe", {
      endpoint,
      origin,
      projectId,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn("[functions] reachability failed", {
        origin,
        projectId,
        error,
      });
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}
