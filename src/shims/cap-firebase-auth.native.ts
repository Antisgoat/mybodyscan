/**
 * Native-build shim for the Capacitor Firebase Authentication web wrapper.
 *
 * On native iOS/Android we must NOT load the package's web implementation
 * (it can import Firebase JS Auth and crash WKWebView).
 *
 * Hard requirements:
 * - MUST throw at import-time (to prevent accidental use).
 * - Must NOT embed forbidden token strings in the emitted native bundle.
 * - When invoked, must fail clearly and safely.
 */

const DISABLED_MESSAGE =
  "Capacitor Firebase Authentication web implementation is disabled on native builds. " +
  "Use the native auth facade.";

function disabledError() {
  const err = new Error(DISABLED_MESSAGE);
  (err as any).code = "auth/capacitor-firebase-web-disabled";
  return err;
}

function rejectDisabled<T = never>(): Promise<T> {
  return Promise.reject(disabledError());
}

// Non-negotiable: fail fast if anything tries to import this.
throw disabledError();

// Minimal stubs: some bundlers/code paths may expect these names.
export function __disabled(): Promise<never> {
  return rejectDisabled();
}

export default __disabled;

