import {
  browserLocalPersistence,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  setPersistence,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

type NativePersistenceMode =
  | "indexeddb"
  | "local"
  | "memory"
  | "unknown";

let persistencePromise: Promise<NativePersistenceMode> | null = null;
const PERSISTENCE_TIMEOUT_MS = 4_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("persistence_timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function webRequireAuth(): Promise<null> {
  return null;
}

export async function ensureWebAuthPersistence(): Promise<NativePersistenceMode> {
  if (persistencePromise) return persistencePromise;
  persistencePromise = (async () => {
    const tryPersistence = async (
      persistence: Parameters<typeof setPersistence>[1]
    ): Promise<NativePersistenceMode | null> => {
      try {
        await withTimeout(setPersistence(auth, persistence), PERSISTENCE_TIMEOUT_MS);
        if (persistence === indexedDBLocalPersistence) return "indexeddb";
        if (persistence === browserLocalPersistence) return "local";
        if (persistence === inMemoryPersistence) return "memory";
        return null;
      } catch {
        return null;
      }
    };
    const indexedDb = await tryPersistence(indexedDBLocalPersistence);
    if (indexedDb) return indexedDb;
    const local = await tryPersistence(browserLocalPersistence);
    if (local) return local;
    const memory = await tryPersistence(inMemoryPersistence);
    if (memory) return memory;
    return "unknown";
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
