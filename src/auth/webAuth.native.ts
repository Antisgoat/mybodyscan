import {
  browserLocalPersistence,
  indexedDBLocalPersistence,
  inMemoryPersistence,
  setPersistence,
} from "firebase/auth";

import { auth } from "@/lib/firebase";

type NativePersistenceMode = "indexeddb" | "local" | "memory";

let persistencePromise: Promise<NativePersistenceMode> | null = null;
const INDEXEDDB_PERSISTENCE_TIMEOUT_MS = 450;
const LOCAL_PERSISTENCE_TIMEOUT_MS = 350;
const MEMORY_PERSISTENCE_TIMEOUT_MS = 200;

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
    const attempts: Array<{
      label: NativePersistenceMode;
      persistence: Parameters<typeof setPersistence>[1];
      timeoutMs: number;
    }> = [
      {
        label: "indexeddb",
        persistence: indexedDBLocalPersistence,
        timeoutMs: INDEXEDDB_PERSISTENCE_TIMEOUT_MS,
      },
      {
        label: "local",
        persistence: browserLocalPersistence,
        timeoutMs: LOCAL_PERSISTENCE_TIMEOUT_MS,
      },
      {
        label: "memory",
        persistence: inMemoryPersistence,
        timeoutMs: MEMORY_PERSISTENCE_TIMEOUT_MS,
      },
    ];

    for (const attempt of attempts) {
      try {
        await withTimeout(
          setPersistence(auth, attempt.persistence),
          attempt.timeoutMs
        );
        return attempt.label;
      } catch {
        // try next fallback
      }
    }

    return "memory";
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
