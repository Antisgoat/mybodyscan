import {
  getRedirectResult,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  type UserCredential,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

// Prefer redirect on iOS/Capacitor/WebView; popup on desktop browsers.
function isNativeCapacitor(): boolean {
  try { return !!(window as any).Capacitor?.isNativePlatform?.(); } catch { return false; }
}
function isIOSWeb(): boolean {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua);
}
function isLikelyWebView(): boolean {
  const ua = navigator.userAgent || "";
  return /(wv|WebView|; wv\))/i.test(ua) || (window as any).flutter_inappwebview != null;
}
function preferRedirect(): boolean {
  return isNativeCapacitor() || isIOSWeb() || isLikelyWebView();
}

function storeNext(next?: string | null) {
  try { localStorage.setItem("auth_next", next || "/home"); } catch {}
}
export function consumeNext(): string {
  try {
    const n = localStorage.getItem("auth_next");
    if (n) { localStorage.removeItem("auth_next"); return n; }
  } catch {}
  return "/home";
}

export async function signInWithGoogle(next?: string | null): Promise<void> {
  storeNext(next);
  const provider = new GoogleAuthProvider();
  // Add basic scopes if desired (profile, email enabled by default).
  if (preferRedirect()) {
    await signInWithRedirect(auth, provider);
  } else {
    await signInWithPopup(auth, provider);
  }
}

export async function signInWithApple(next?: string | null): Promise<void> {
  storeNext(next);
  const provider = new OAuthProvider("apple.com");
  // Request user name & email on first sign-in; Apple may provide them once.
  provider.addScope("email");
  provider.addScope("name");
  // Optional custom parameters:
  // provider.setCustomParameters({ locale: "en_US" });

  if (preferRedirect()) {
    await signInWithRedirect(auth, provider);
  } else {
    await signInWithPopup(auth, provider);
  }
}

// Handle a completed redirect (Apple/Google).
export async function handleAuthRedirectResult(): Promise<UserCredential | null> {
  try {
    const cred = await getRedirectResult(auth);
    return cred; // may be null if no redirect pending
  } catch (e) {
    // Swallow popup blockers/redirect oddities; caller can show a toast if needed.
    return null;
  }
}
