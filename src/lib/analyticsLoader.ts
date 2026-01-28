const ENV = (import.meta as any)?.env || {};

function parseScriptList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadWebAnalyticsScripts(): void {
  if (typeof document === "undefined") return;
  const scripts = parseScriptList(ENV.VITE_WEB_ANALYTICS_SCRIPTS as string | undefined);
  if (!scripts.length) return;

  for (const src of scripts) {
    if (!src || document.querySelector(`script[src="${src}"]`)) {
      continue;
    }
    const tag = document.createElement("script");
    tag.src = src;
    tag.async = true;
    tag.defer = true;
    document.head.appendChild(tag);
  }
}
