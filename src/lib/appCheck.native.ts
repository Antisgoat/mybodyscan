import { registerPlugin } from "@capacitor/core";
import {
  CustomProvider,
  getToken,
  initializeAppCheck,
  type AppCheck,
} from "firebase/app-check";

import { firebaseApp } from "@/lib/firebase";

type NativeAppCheckPlugin = {
  initialize(options?: {
    debugToken?: boolean | string;
    isTokenAutoRefreshEnabled?: boolean;
  }): Promise<void>;
  getToken(options?: {
    forceRefresh?: boolean;
  }): Promise<{ token: string; expireTimeMillis?: number }>;
};

// Register the native bridge directly. Importing the package entrypoint would
// also bundle its Firebase Web fallback, which is incorrect inside a native
// Capacitor shell.
const FirebaseAppCheck =
  registerPlugin<NativeAppCheckPlugin>("FirebaseAppCheck");

let initializePromise: Promise<void> | null = null;
let warningLogged = false;
let instance: AppCheck | null = null;

async function getNativeToken(): Promise<{
  token: string;
  expireTimeMillis: number;
}> {
  await ensureNativeAppCheck();
  const result = await FirebaseAppCheck.getToken({ forceRefresh: true });
  if (!result.token) {
    throw new Error("Native App Check returned an empty token.");
  }
  return {
    token: result.token,
    // Both native platforms return this field. The conservative fallback keeps
    // the JS SDK from caching an otherwise valid token indefinitely.
    expireTimeMillis:
      result.expireTimeMillis ?? Date.now() + 50 * 60 * 1000,
  };
}

async function ensureNativeAppCheck(): Promise<void> {
  if (!initializePromise) {
    initializePromise = FirebaseAppCheck.initialize({
      isTokenAutoRefreshEnabled: true,
    });
  }
  await initializePromise;
}

function init(): AppCheck | null {
  if (instance) return instance;
  try {
    // Firestore, Storage, and callable Functions still use the Firebase JS
    // clients inside Capacitor. Feeding native App Attest / Play Integrity
    // tokens through CustomProvider makes those SDK requests attested too.
    instance = initializeAppCheck(firebaseApp, {
      provider: new CustomProvider({
        getToken: getNativeToken,
      }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    if (!warningLogged) {
      console.warn("[AppCheck] native_adapter_init_failed_soft", error);
      warningLogged = true;
    }
  }
  return instance;
}

export const appCheck = init();

export function hasAppCheck(): boolean {
  return true;
}

export async function ensureAppCheck(): Promise<void> {
  try {
    await ensureNativeAppCheck();
    init();
  } catch (error) {
    if (!warningLogged) {
      console.warn("[AppCheck] native_init_failed_soft", error);
      warningLogged = true;
    }
  }
}

export async function getAppCheckTokenHeader(
  forceRefresh = false
): Promise<Record<string, string>> {
  try {
    await ensureAppCheck();
    const current = init();
    if (!current) return {};
    const { token } = await getToken(current, forceRefresh);
    return token ? { "X-Firebase-AppCheck": token } : {};
  } catch (error) {
    if (!warningLogged) {
      console.warn("[AppCheck] native_token_failed_soft", error);
      warningLogged = true;
    }
    return {};
  }
}

export async function getAppCheckHeader(
  forceRefresh = false
): Promise<Record<string, string>> {
  return getAppCheckTokenHeader(forceRefresh);
}
