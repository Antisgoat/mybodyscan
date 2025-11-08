import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";
import { ensureAppCheck } from "./appcheck";

export async function call<TReq = unknown, TRes = unknown>(name: string, data?: TReq) {
  await ensureAppCheck();
  const fn = httpsCallable<TReq, TRes>(functions, name);
  return fn(data as TReq);
}
