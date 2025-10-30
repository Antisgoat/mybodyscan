import { fetchSignInMethodsForEmail, getRedirectResult } from "firebase/auth";
import { auth } from "./firebase";
import { firebaseReady } from "./firebase";
import { toast } from "./toast";
let done = false;
export async function handleAuthRedirectOnce() {
  if (done) return;
  done = true;
  try {
    await firebaseReady();
    await getRedirectResult(auth);
  } catch (err: any) {
    const code = typeof err?.code === "string" ? err.code : "auth/unknown";
    if (code === "auth/account-exists-with-different-credential") {
      const email = err?.customData?.email as string | undefined;
      if (email) {
        try {
          const methods = await fetchSignInMethodsForEmail(auth, email);
          const hint = methods && methods.length ? `Use: ${methods.join(", ")}` : "Use your original method.";
          toast(import.meta.env.DEV ? `Account exists with different credential (${code}). ${hint}` : "This email is already linked to another sign-in method. Please use that method.", "error");
        } catch {
          toast(import.meta.env.DEV ? `Account exists with different credential (${code}).` : "This email is already linked to another sign-in method.", "error");
        }
      }
    } else if (import.meta.env.DEV) {
      toast(`Auth redirect failed (${code})`, "error");
    }
  }
}
