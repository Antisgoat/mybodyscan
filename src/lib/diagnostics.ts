import { auth as firebaseAuth } from "@/lib/firebase";
import { getBreadcrumbs } from "./logger";
export function buildDiagnostics(): string {
  const u = firebaseAuth.currentUser;
  const info = {
    uid: u?.uid || "signed-out",
    email: u?.email || "",
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ua: navigator.userAgent,
    path: window.location.pathname,
    ts: new Date().toISOString(),
    breadcrumbs: getBreadcrumbs(),
  };
  return JSON.stringify(info, null, 2);
}
export async function copyDiagnostics() {
  const text = buildDiagnostics();
  await navigator.clipboard.writeText(text);
}
