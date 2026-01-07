/**
 * DEPRECATED: `src/lib/authFacade.ts` is the only supported app auth entrypoint.
 *
 * This file is kept as a thin compatibility shim so older imports don't
 * accidentally pull `firebase/auth` into the native (WKWebView) boot graph.
 */
export {
  useAuthUser,
  useAuthPhase,
  startAuthListener,
  signOutToAuth,
  createAccountEmail,
  sendReset,
} from "@/lib/authFacade";

