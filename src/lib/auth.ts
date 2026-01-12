/**
 * DEPRECATED: `src/auth/mbs-auth.ts` is the only supported app auth entrypoint.
 *
 * This file is kept as a thin compatibility shim so older imports don't
 * accidentally pull Firebase Auth into the native (WKWebView) boot graph.
 */
export {
  useAuthUser,
  useAuthPhase,
  startAuthListener,
  signOutToAuth,
  createAccountEmail,
  sendReset,
  __authTestInternals,
} from "@/auth/mbs-auth";
