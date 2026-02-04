import {
  browserLocalPersistence,
  browserSessionPersistence,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  setPersistence,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

type NativePersistenceMode =
  | "indexeddb"
  | "local"
  | "session"
  | "memory"
  | "unknown";

let persistencePromise: Promise<NativePersistenceMode> | null = null;

export async function webRequireAuth(): Promise<null> {
  return null;
}

export async function ensureWebAuthPersistence(): Promise<NativePersistenceMode> {
  if (persistencePromise) return persistencePromise;
  persistencePromise = (async () => {
    try {
      await setPersistence(auth, indexedDBLocalPersistence);
      return "indexeddb";
    } catch {
      // ignore
    }
    try {
      await setPersistence(auth, browserLocalPersistence);
      return "local";
    } catch {
      // ignore
    }
    try {
      await setPersistence(auth, browserSessionPersistence);
      return "session";
    } catch {
      // ignore
    }
    try {
      await setPersistence(auth, inMemoryPersistence);
      return "memory";
    } catch {
      return "unknown";
    }
  })();
  return persistencePromise;
}

export async function finalizeRedirectResult(): Promise<null> {
  return null;
}

export default {
  webRequireAuth,
  ensureWebAuthPersistence,
  finalizeRedirectResult,
};
