const IOS_UA_REGEX = /iPhone|iPad|iPod/;
const STANDALONE_DISPLAY_MODE_QUERY = "(display-mode: standalone)";
const DEFAULT_REDIRECT_HOST = "https://mybodyscanapp.com";

export function isWeb(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function isNative(): boolean {
  try {
    const w = window as any;
    const proto = window.location?.protocol;
    return (
      proto === "capacitor:" ||
      proto === "ionic:" ||
      !!w?.Capacitor?.isNativePlatform?.()
    );
  } catch {
    return false;
  }
}

function getUserAgent(): string {
  if (!isWeb() || typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

function isStandaloneDisplayMode(): boolean {
  if (!isWeb()) return false;
  if (
    typeof navigator !== "undefined" &&
    (navigator as any).standalone === true
  ) {
    return true;
  }
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    try {
      return window.matchMedia(STANDALONE_DISPLAY_MODE_QUERY).matches;
    } catch {
      return false;
    }
  }
  return false;
}

function hasIOSIndicators(): boolean {
  if (!isWeb() || typeof navigator === "undefined") return false;
  const ua = getUserAgent();
  if (IOS_UA_REGEX.test(ua)) return true;
  const platform = ((navigator as any).platform ?? "") as string;
  const maxTouchPoints = Number((navigator as any).maxTouchPoints ?? 0);
  return platform === "MacIntel" && maxTouchPoints > 1;
}

export function isIOSWebView(): boolean {
  if (!isWeb()) return false;
  if (!hasIOSIndicators()) return false;
  if (isStandaloneDisplayMode()) return false;
  const ua = getUserAgent();
  const isSafariEngine =
    /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
  return isSafariEngine;
}

export function isCapacitor(): boolean {
  if (!isWeb()) return false;
  const candidate: any = (window as any).Capacitor;
  if (!candidate) return false;
  try {
    if (typeof candidate.isNativePlatform === "function") {
      const result = candidate.isNativePlatform();
      if (typeof result === "boolean") {
        return result;
      }
    }
  } catch {
    // ignore errors from Capacitor runtime detection
  }
  return Boolean(candidate.isNative);
}

export function isAndroidWebView(): boolean {
  if (!isWeb() || typeof navigator === "undefined") return false;
  const ua = getUserAgent();
  if (!/Android/i.test(ua)) return false;
  const hasWebViewToken = ua.includes("; wv") || ua.includes("Version/");
  const isDesktopChrome = /Chrome\/\d+/.test(ua) && !/Mobile/.test(ua);
  if (isDesktopChrome) return false;
  if (hasWebViewToken) return true;
  return !/Chrome\/\d+/.test(ua);
}

export function isInAppBrowser(): boolean {
  return isIOSWebView() || isAndroidWebView() || isCapacitor();
}

export function getCanonicalOAuthReturnUrl(): string {
  return `${DEFAULT_REDIRECT_HOST}/oauth/return`;
}

// Backward-compatible alias for older code paths.
export const isNativeCapacitor = isNative;

export async function openExternalUrl(url: string): Promise<void> {
  const anyWin = globalThis as any;
  try {
    const cap = anyWin.Capacitor;
    if (cap) {
      // Try Capacitor Browser plugin if present
      const Browser = cap.Plugins?.Browser || cap.Browser;
      if (Browser && typeof Browser.open === "function") {
        await Browser.open({ url });
        return;
      }
    }
  } catch {
    // fall through to web
  }
  if (typeof window !== "undefined" && url) {
    window.location.href = url;
  }
}

export function hasGetUserMedia(): boolean {
  return Boolean(
    typeof navigator !== "undefined" &&
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia
  );
}

export function isSecureContextOrLocal(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.isSecureContext === "boolean" && window.isSecureContext)
    return true;
  if (typeof window.location !== "undefined") {
    return window.location.hostname === "localhost";
  }
  return false;
}

export function cameraReadyOnThisDevice(): boolean {
  return isNativeCapacitor() || (isSecureContextOrLocal() && hasGetUserMedia());
}
