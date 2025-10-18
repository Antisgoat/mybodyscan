import { auth } from "@app/lib/firebase.ts";
import { getBreadcrumbs } from "./logger.ts";
export async function buildDiagnostics(): Promise<string> {
  const u = auth.currentUser;
  const info = {
    uid: u?.uid || "signed-out",
    email: u?.email || "",
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    ua: navigator.userAgent,
    path: window.location.pathname,
    ts: new Date().toISOString(),
    breadcrumbs: getBreadcrumbs()
  };
  return JSON.stringify(info, null, 2);
}
export async function copyDiagnostics() {
  const text = await buildDiagnostics();
  await navigator.clipboard.writeText(text);
}
