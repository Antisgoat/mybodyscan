/**
 * Native-build shim for the Capacitor Firebase Authentication web wrapper.
 *
 * On native iOS/Android we must NOT load the package's web implementation
 * (it can import Firebase JS Auth and crash WKWebView).
 *
 * If something accidentally imports this module in a native build, fail loudly
 * with a clear error.
 */

const DISABLED_MESSAGE =
  "Capacitor Firebase Authentication web bundle is disabled on native builds. Use the native auth plugin via registerPlugin('FirebaseAuthentication').";

export function __disabled(): never {
  const err = new Error(DISABLED_MESSAGE);
  (err as any).code = "auth/cap-firebase-web-disabled";
  throw err;
}

// Common export names that might be referenced in some code paths.
export default __disabled;

