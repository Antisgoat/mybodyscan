import { getRedirectResult } from "firebase/auth";
import { auth } from "./firebase";
let done = false;
export async function handleAuthRedirectOnce() {
  if (done) return;
  done = true;
  try { await getRedirectResult(auth); } catch {}
}
