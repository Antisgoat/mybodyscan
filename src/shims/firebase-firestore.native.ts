/**
 * Native-build shim for `firebase/firestore`.
 *
 * The `firebase/*` wrapper entrypoints embed a version/registry list that includes
 * `*-compat` package names. Native builds must keep those tokens out of the bundle,
 * so we re-export from the underlying modular package.
 */
export * from "@firebase/firestore";

