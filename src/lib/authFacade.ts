/**
 * Back-compat re-export.
 *
 * The app should use `src/auth/mbs-auth.ts` as the single auth API entrypoint.
 * This file exists only so older imports continue to work without pulling
 * web-only Firebase Auth into the native boot graph.
 */
export * from "@/auth/mbs-auth";
