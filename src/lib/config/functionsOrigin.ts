import { APP_CONFIG } from "@/generated/appConfig";
import {
  getFunctionsBaseUrl as getSharedFunctionsBaseUrl,
  getFunctionsOrigin as getSharedFunctionsOrigin,
  urlJoin,
} from "@/lib/backend/functionsOrigin";

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

export { urlJoin };

export function getFunctionsProjectId(): string {
  return (
    String(APP_CONFIG?.firebase?.projectId || "").trim() ||
    readEnv("VITE_FIREBASE_PROJECT_ID") ||
    readEnv("FIREBASE_PROJECT_ID")
  );
}

export function getFunctionsRegion(): string {
  return readEnv("VITE_FUNCTIONS_REGION") || "us-central1";
}

export function getFunctionsOrigin(): {
  origin: string;
  region: string;
  projectId: string;
} {
  const projectId = getFunctionsProjectId();
  const region = getFunctionsRegion();
  return {
    origin: getSharedFunctionsOrigin(),
    region,
    projectId,
  };
}

export function getFunctionsBaseUrl(): string {
  return getSharedFunctionsBaseUrl();
}

export async function functionsReachable(timeoutMs = 2500): Promise<boolean> {
  let origin = "";
  try {
    origin = getSharedFunctionsOrigin();
  } catch {
    return false;
  }
  const endpoint = urlJoin(origin, "/health");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
