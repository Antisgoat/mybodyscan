/**
 * Native-build shim for `firebase/storage`.
 *
 * Re-export the modular implementation to avoid bundling firebase wrapper metadata
 * (which contains forbidden `*-compat` tokens in native builds).
 */
export * from "@firebase/storage";

