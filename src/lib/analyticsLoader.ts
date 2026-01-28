import { isNative } from "@/lib/platform";

const ENV = (import.meta as any)?.env || {};

function parseScriptList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isDebugLoggingEnabled() {
  return Boolean((import.meta as any)?.env?.DEV) || !__MBS_NATIVE_RELEASE__;
}

function debugLog(message: string, payload?: Record<string, unknown>) {
  if (!isDebugLoggingEnabled()) return;
  if (payload) {
    // eslint-disable-next-line no-console
    console.info(`[analytics] ${message}`, payload);
  } else {
    // eslint-disable-next-line no-console
    console.info(`[analytics] ${message}`);
  }
}

function resolveAnalyticsScripts(isNativeBuild: boolean): string[] {
  const webScripts = parseScriptList(
    ENV.VITE_WEB_ANALYTICS_SCRIPTS as string | undefined
  );
  if (!isNativeBuild) return webScripts;

  const nativeEnabled =
    ENV.VITE_NATIVE_ANALYTICS_ENABLED === "1" ||
    ENV.VITE_NATIVE_ANALYTICS_ENABLED === "true";
  if (!nativeEnabled) {
    if (webScripts.length) {
      debugLog("native scripts disabled", { count: webScripts.length });
    } else {
      debugLog("native scripts disabled (no scripts configured)");
    }
    return [];
  }

  const nativeScripts = parseScriptList(
    ENV.VITE_NATIVE_ANALYTICS_SCRIPTS as string | undefined
  );
  return nativeScripts.length ? nativeScripts : webScripts;
}

export function loadAnalyticsScripts(options?: { isNativeBuild?: boolean }): void {
  if (typeof document === "undefined") return;
  const nativeBuild = options?.isNativeBuild ?? isNative();
  const scripts = resolveAnalyticsScripts(nativeBuild);
  if (!scripts.length) return;

  for (const src of scripts) {
    if (!src) continue;
    if (document.querySelector(`script[src="${src}"]`)) {
      debugLog("script already loaded", { src });
      continue;
    }
    const tag = document.createElement("script");
    tag.src = src;
    tag.async = true;
    tag.defer = true;
    document.head.appendChild(tag);
    debugLog("script loaded", { src, native: nativeBuild });
  }
}
