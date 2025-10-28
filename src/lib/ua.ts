export function isIOSWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPhone/iPad/iPod + WebKit present; exclude Chrome/Firefox on iOS (CriOS/FxiOS)
  const isIOS = /(iPhone|iPad|iPod)/.test(ua);
  const isWebKit = /WebKit\//.test(ua);
  const isAltBrowser = /(CriOS|FxiOS)/.test(ua);
  return isIOS && isWebKit && !isAltBrowser;
}

export function isSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // Safari on macOS or iOS: userAgent contains Safari but not Chrome/Edge/Opera variants
  const isSafariTokenPresent = /Safari\//.test(ua);
  const isNonSafariEngine = /(Chrome|CriOS|FxiOS|Edg|EdgiOS|OPR|OPiOS)/.test(ua);
  return isSafariTokenPresent && !isNonSafariEngine;
}

export function isMobileWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isWebKit = /WebKit\//.test(ua);
  const isMobile = /(Mobile|iPhone|iPad|iPod|Android)/.test(ua);
  return isWebKit && isMobile;
}
