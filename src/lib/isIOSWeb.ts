export function isIOSWeb(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const platform = (navigator as any).platform || "";
  const maxTouchPoints = (navigator as any).maxTouchPoints || 0;

  const isIOSUA = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13Plus = platform === "MacIntel" && maxTouchPoints > 1;

  return isIOSUA || isIPadOS13Plus;
}

export function isIOSSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
  return isIOSWeb() && isSafari;
}

export default isIOSWeb;

