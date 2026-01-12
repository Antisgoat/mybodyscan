/**
 * Native-build guard: forbid Capacitor Firebase Auth runtime imports.
 *
 * Native code should use the registerPlugin wrapper instead of the package's
 * web implementation, which bundles Firebase JS SDK auth.
 */

const MESSAGE =
  "Forbidden import: Capacitor Firebase Auth runtime import is not allowed in native builds. Use the native wrapper.";

throw new Error(MESSAGE);

export {};
