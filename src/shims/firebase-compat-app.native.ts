/**
 * Native-build shim for forbidden firebase compat entrypoints.
 *
 * If this is ever imported in a native build, fail loudly and let the native crash
 * shield render an error UI (never a white screen).
 */
throw new Error(
  "Firebase compat entrypoints are forbidden in native builds. Use modular Firebase imports."
);

