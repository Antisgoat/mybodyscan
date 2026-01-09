/**
 * Native-build shim for the Capacitor Firebase Authentication web wrapper.
 *
 * On native iOS/Android we must NOT load the package's web implementation
 * (it can import Firebase JS Auth and crash WKWebView).
 *
 * Hard requirements:
 * - Must NOT throw at import-time (boot safety).
 * - Must NOT embed forbidden token strings in the emitted native bundle.
 * - When invoked, must fail clearly and safely.
 */

const PKG = "@capacitor-firebase/" + "authentication";
const DISABLED_MESSAGE =
  "Do not import " +
  PKG +
  " in the web bundle for native. Use registerPlugin in impl.native.";

function disabledError() {
  const err = new Error(DISABLED_MESSAGE);
  (err as any).code = "auth/capacitor-firebase-web-disabled";
  return err;
}

function rejectDisabled<T = never>(): Promise<T> {
  return Promise.reject(disabledError());
}

// Minimal stubs: some bundlers/code paths may expect these names.
export function __disabled(): Promise<never> {
  return rejectDisabled();
}

export default __disabled;

