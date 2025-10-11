export function isIOSWeb(): boolean {
  if (typeof navigator === "undefined") return false;
  const userAgent = navigator.userAgent || "";
  const platform = (navigator as any).platform || "";
  const maxTouchPoints = (navigator as any).maxTouchPoints || 0;

  const isIOSUA = /iPad|iPhone|iPod/.test(userAgent);
  const isIPadOS13Plus = platform === "MacIntel" && maxTouchPoints > 1;

  return isIOSUA || isIPadOS13Plus;
}

export default isIOSWeb;
