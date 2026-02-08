import { isNative } from "@/lib/platform";

const ENV = (import.meta as any)?.env || {};
const NATIVE_EXTERNAL_SCRIPTS_ENABLED =
  ENV.VITE_NATIVE_EXTERNAL_SCRIPTS_ENABLED === "1" ||
  ENV.VITE_NATIVE_EXTERNAL_SCRIPTS_ENABLED === "true";

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
      debugLog("analytics disabled for native build", { count: webScripts.length });
    } else {
      debugLog("analytics disabled for native build (no scripts configured)");
    }
    return [];
  }
  debugLog("analytics enabled via flag");

  const nativeScripts = parseScriptList(
    ENV.VITE_NATIVE_ANALYTICS_SCRIPTS as string | undefined
  );
  const resolved = nativeScripts.length ? nativeScripts : webScripts;
  if (NATIVE_EXTERNAL_SCRIPTS_ENABLED) {
    return resolved;
  }
  const blocked = resolved.filter((src) => isBlockedNativeScript(src));
  if (blocked.length) {
    debugLog("blocked external scripts for native", { blocked });
  }
  return resolved.filter((src) => !isBlockedNativeScript(src));
}

function isBlockedNativeScript(src: string): boolean {
  try {
    const url = new URL(src);
    const host = url.hostname.toLowerCase();
    if (host.includes("stripe.com")) return true;
    if (host.includes("google.com")) return true;
    if (host.includes("googleapis.com")) return true;
    if (host.includes("gstatic.com")) return true;
    return false;
  } catch {
    const normalized = src.toLowerCase();
    return (
      normalized.includes("stripe") ||
      normalized.includes("google") ||
      normalized.includes("gstatic")
    );
  }
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
