import { isCapacitorNative } from "@/lib/platform/isNative";

const DEFAULT_NATIVE_API_BASE =
  "https://us-central1-mybodyscan-f3daf.cloudfunctions.net/api";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const env = ((import.meta as any)?.env ?? {}) as Record<string, unknown>;
  const configured =
    (typeof env.VITE_API_BASE_URL === "string" && env.VITE_API_BASE_URL.trim()) ||
    (typeof env.VITE_FUNCTIONS_URL === "string" && env.VITE_FUNCTIONS_URL.trim()) ||
    "";

  if (configured) {
    return trimTrailingSlash(configured);
  }

  if (isCapacitorNative()) {
    return DEFAULT_NATIVE_API_BASE;
  }

  return "/api";
}

let logged = false;

export function logNativeApiDebug(): void {
  if (logged || typeof window === "undefined") return;
  if (!isCapacitorNative()) return;
  logged = true;
  const base = getApiBaseUrl();
  // eslint-disable-next-line no-console
  console.info("[native-api]", {
    baseUrl: base,
    endpoints: {
      getPlan: `${base}/getPlan`,
      getWorkouts: `${base}/getWorkouts`,
      applyCatalogPlan: `${base}/applyCatalogPlan`,
      coachChat: `${base}/coach/chat`,
      nutritionSearch: `${base}/nutrition/search`,
      health: `${base}/health`,
    },
  });
}
