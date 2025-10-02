export function isDemoMode(user: { uid?: string } | null, location: Location): boolean {
  if (!user && (location.pathname === "/welcome" || location.search.includes("demo=1"))) return true;
  return false;
}

export const DEMO_QUERY_PARAM = "demo";

export const DEMO_ALLOWED_PATHS = [
  "/welcome",
  "/home",
  "/meals",
  "/programs",
  "/coach",
  "/settings",
] as const;

export type DemoAllowedPath = (typeof DEMO_ALLOWED_PATHS)[number];

export function isPathAllowedInDemo(pathname: string): boolean {
  return DEMO_ALLOWED_PATHS.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}
