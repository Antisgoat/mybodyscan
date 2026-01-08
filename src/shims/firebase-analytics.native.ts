/**
 * Native-build shim for `firebase/analytics`.
 *
 * Re-export the modular implementation to avoid bundling firebase wrapper metadata
 * (which contains forbidden `*-compat` tokens in native builds).
 */
export * from "@firebase/analytics";

