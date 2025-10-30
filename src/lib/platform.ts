const IOS_UA_REGEX = /iPhone|iPad|iPod/;
const STANDALONE_DISPLAY_MODE_QUERY = "(display-mode: standalone)";
const DEFAULT_REDIRECT_HOST = "https://mybodyscanapp.com";

export function isWeb(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getUserAgent(): string {
  if (!isWeb() || typeof navigator === "undefined") return "";
  return navigator.userAgent || "";
}

function isStandaloneDisplayMode(): boolean {
  if (!isWeb()) return false;
  if (typeof navigator !== "undefined" && (navigator as any).standalone === true) {
    return true;
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
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
  const isSafariEngine = /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/i.test(ua);
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
