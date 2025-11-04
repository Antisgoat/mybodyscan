import { httpsCallable } from "firebase/functions";
import { ensureAppCheck, functions } from "./firebase";

export async function call<TReq = unknown, TRes = unknown>(name: string, data?: TReq) {
  ensureAppCheck();
  const fn = httpsCallable<TReq, TRes>(functions, name);
  return fn(data as TReq);
}
