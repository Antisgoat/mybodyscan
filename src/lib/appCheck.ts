import { getAppCheck, getToken, type AppCheck } from "firebase/app-check";
import { app } from "@/lib/firebase";

let appCheckInstance: AppCheck | null = null;
let warnedMissing = false;

function resolveInstance(): AppCheck | null {
  if (typeof window === "undefined") return null;
  if (appCheckInstance) return appCheckInstance;
  try {
    appCheckInstance = getAppCheck(app);
  } catch (err) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn("[AppCheck] App Check not initialized", err);
    }
    appCheckInstance = null;
  }
  return appCheckInstance;
}

export function ensureAppCheckInitialized(): void {
  resolveInstance();
}

export async function fetchAppCheckToken(forceRefresh = false): Promise<string | null> {
  const instance = resolveInstance();
  if (!instance) return null;
  try {
    const { token } = await getToken(instance, forceRefresh);
    return token;
  } catch (err) {
    console.error("[AppCheck] token retrieval failed", err);
    return null;
  }
}
