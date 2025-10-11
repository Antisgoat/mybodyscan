import type { HttpsError } from "firebase-functions/v2/https";

declare module "firebase-functions/v2/https" {
  interface HttpsError {
    /** Typing shim to satisfy legacy reads; runtime already carries a code string. */
    code: string;
  }
}
