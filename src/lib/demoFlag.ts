export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

const DEMO_KEY = "mbs_demo";
export const DEMO_QUERY_PARAM = "demo";
export const DEMO_ALLOWED_PATHS = [
  "/welcome",
  "/home",
  "/demo",
  "/meals",
  "/programs",
  "/coach",
  "/settings",
] as const;

export type DemoAllowedPath = (typeof DEMO_ALLOWED_PATHS)[number];

export function isDemoActive() {
  if (DEMO_MODE) return true;
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const hasParam = params.get(DEMO_QUERY_PARAM) === "1";
  const stored = window.localStorage.getItem(DEMO_KEY) === "1";
  return stored || hasParam;
}

export function enableDemo() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_KEY, "1");
}

export function disableDemo() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEMO_KEY);
}

type LocationLike = { pathname: string; search: string };

export function isDemoMode(user: { uid?: string } | null | undefined, currentLocation: LocationLike): boolean {
  if (DEMO_MODE) return true;
  if (typeof window !== "undefined" && isDemoActive()) return true;
  if (!user && (isPathAllowedInDemo(currentLocation.pathname) || currentLocation.search.includes(`${DEMO_QUERY_PARAM}=`))) {
    return true;
  }
  return false;
}

export function isPathAllowedInDemo(pathname: string): boolean {
  return DEMO_ALLOWED_PATHS.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}
