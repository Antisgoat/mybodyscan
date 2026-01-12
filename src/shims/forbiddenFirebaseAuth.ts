/**
 * Native-build guard: forbid Firebase JS Auth in native bundles.
 *
 * This module should never be executed. It exists to make accidental
 * imports explode loudly during native builds.
 */

const MESSAGE =
  "Forbidden import: Firebase JS Auth is not allowed in native builds. Use the native auth facade.";

throw new Error(MESSAGE);

export {};
