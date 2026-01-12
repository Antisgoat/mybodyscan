/**
 * Native-build guard: forbid Firebase JS Auth in native bundles.
 *
 * This module should never be executed. It exists to make accidental
 * imports explode loudly during native builds.
 */

const MESSAGE =
  "FORBIDDEN in native build: firebase/auth (web auth must not ship to iOS).";

throw new Error(MESSAGE);

export {};
