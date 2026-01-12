/**
 * Native-build guard: forbid Capacitor Firebase Auth runtime imports.
 *
 * Native code should use the registerPlugin wrapper instead of the package's
 * web implementation, which bundles Firebase JS SDK auth.
 */

const MESSAGE =
  "FORBIDDEN in native build: @capacitor-firebase/authentication (web auth must not ship to iOS).";

throw new Error(MESSAGE);

export {};
