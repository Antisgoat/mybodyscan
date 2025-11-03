import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

export async function call<TReq = unknown, TRes = unknown>(name: string, data?: TReq) {
  const fn = httpsCallable<TReq, TRes>(functions, name);
  return fn(data as TReq);
}
