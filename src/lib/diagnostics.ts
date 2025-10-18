import { getAuth } from "firebase/auth";
import { getBreadcrumbs } from "./logger";
export async function buildDiagnostics(): Promise<string> {
  const u = getAuth().currentUser;
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
