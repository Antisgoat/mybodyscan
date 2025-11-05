import { httpsCallable } from "firebase/functions";
import { ensureAppCheck, functions, getAppCheckTokenSafe } from "./firebase";

let loggedCallableWarning = false;

export async function call<TReq = unknown, TRes = unknown>(name: string, data?: TReq) {
  ensureAppCheck();
  const token = await getAppCheckTokenSafe();
  if (!token && !loggedCallableWarning) {
    console.warn("App Check token missing; proceeding in soft mode");
    loggedCallableWarning = true;
  }
  const fn = httpsCallable<TReq, TRes>(functions, name);
  return fn(data as TReq, token ? ({ appCheckToken: token } as any) : undefined);
}
