import { DEMO_MODE } from "@/env";
import { isDemoActive } from "./demoFlag";

export function isDemoMode(user: { uid?: string } | null, location: Location): boolean {
  if (DEMO_MODE) return true;
  if (typeof window !== "undefined" && isDemoActive()) return true;
  if (!user && (location.pathname === "/welcome" || location.search.includes("demo=1"))) return true;
  return false;
}

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

export function isPathAllowedInDemo(pathname: string): boolean {
  return DEMO_ALLOWED_PATHS.some((allowed) => pathname === allowed || pathname.startsWith(`${allowed}/`));
}
