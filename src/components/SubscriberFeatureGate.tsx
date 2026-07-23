import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PageSkeleton } from "@/components/system/PageSkeleton";
import { useDemoMode } from "@/components/DemoModeProvider";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";
import { isNative } from "@/lib/platform";

const SUBSCRIBER_PREFIXES = [
  "/today",
  "/coach",
  "/programs",
  "/nutrition",
  "/workouts",
  "/meals",
  "/barcode",
  "/health",
  "/settings/health",
] as const;

export function isSubscriberOnlyPath(pathname: string): boolean {
  if (
    pathname.startsWith("/results/") &&
    pathname.endsWith("/transformation-preview")
  ) {
    return true;
  }
  return SUBSCRIBER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function SubscriberFeatureGate({
  children,
}: {
  children: ReactNode;
}) {
  const location = useLocation();
  const demo = useDemoMode();
  const { entitlements, loading } = useEntitlements();

  // The signed-out demo is a read-only product preview. It never grants
  // persistent access or unlocks server-side subscriber endpoints.
  if (demo) return <>{children}</>;
  if (loading) return <PageSkeleton label="Checking your plan…" />;
  if (hasPro(entitlements)) return <>{children}</>;

  const next = `${location.pathname}${location.search}`;
  const destination = isNative()
    ? `/paywall?reason=pro&next=${encodeURIComponent(next)}`
    : `/plans?reason=pro&next=${encodeURIComponent(next)}`;
  return <Navigate to={destination} replace state={{ from: next }} />;
}
