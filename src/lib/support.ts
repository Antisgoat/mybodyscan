import { auth } from "@/lib/firebase";

export function supportMailto(extra?: Record<string, string>) {
  const lines: string[] = [];
  const version = import.meta.env.VITE_APP_VERSION as string | undefined;
  if (version) {
    lines.push(`version=${version}`);
  }

  const user = auth.currentUser;
  if (user) {
    lines.push(`uid=${user.uid}`);
    if (user.email) lines.push(`email=${user.email}`);
  }

  lines.push(`route=${window.location.pathname}`);
  lines.push(`timestamp=${new Date().toISOString()}`);
  lines.push(`device=${navigator.userAgent}`);

  const crumbs =
    (window as any).__breadcrumbs ||
    (window as any).__mbsBreadcrumbs ||
    (window as any).__mbsLogs || [];
  if (Array.isArray(crumbs) && crumbs.length) {
    lines.push("logs=" + crumbs.slice(-5).join(" | "));
  }

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      lines.push(`${k}=${v}`);
    }
  }

  const body = encodeURIComponent(lines.join("\n"));
  return `mailto:support@mybodyscanapp.com?subject=MyBodyScan%20Support&body=${body}`;
}
