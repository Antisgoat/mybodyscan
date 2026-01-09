/**
 * Native-build shim for `firebase/app`.
 *
 * The `firebase/*` wrapper entrypoints (like `firebase/app`) embed a static
 * registry of package/version strings that can include auth package IDs even when
 * Auth isn't imported. Our native acceptance tests require those auth IDs to be
 * absent from the iOS bundle, so we route `firebase/app` to `@firebase/app`
 * (which does not embed the auth registry list).
 */

export * from "@firebase/app";

