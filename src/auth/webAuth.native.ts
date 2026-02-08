import {
  browserLocalPersistence,
  inMemoryPersistence,
  setPersistence,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

type NativePersistenceMode = "local" | "memory" | "unknown";

let persistencePromise: Promise<NativePersistenceMode> | null = null;
const LOCAL_PERSISTENCE_TIMEOUT_MS = 350;
const MEMORY_PERSISTENCE_TIMEOUT_MS = 150;

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
    try {
      await withTimeout(
        setPersistence(auth, browserLocalPersistence),
        LOCAL_PERSISTENCE_TIMEOUT_MS
      );
      return "local";
    } catch {
      try {
        await withTimeout(
          setPersistence(auth, inMemoryPersistence),
          MEMORY_PERSISTENCE_TIMEOUT_MS
        );
        return "memory";
      } catch {
        return "unknown";
      }
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
