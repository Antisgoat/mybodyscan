import { useSyncExternalStore } from "react";
import { doc, onSnapshot, type Unsubscribe, Timestamp } from "firebase/firestore";
import { db as firebaseDb } from "@/lib/firebase";
import { onAuthStateChanged } from "@/auth/mbs-auth";
import type { Entitlements } from "@/lib/entitlements/pro";

type Snapshot = {
  uid: string | null;
  entitlements: Entitlements;
  loading: boolean;
  error: string | null;
};

const DEFAULT_ENTITLEMENTS: Entitlements = { pro: false };

let cachedSnapshot: Snapshot = {
  uid: null,
  entitlements: DEFAULT_ENTITLEMENTS,
  loading: true,
  error: null,
};

const listeners = new Set<() => void>();
let unsubscribeAuth: Unsubscribe | null = null;
let unsubscribeDoc: Unsubscribe | null = null;
let activeUid: string | null = null;

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[entitlements] listener error", err);
      }
    }
  });
}

function setSnapshot(patch: Partial<Snapshot>) {
  const next: Snapshot = { ...cachedSnapshot, ...patch };
  if (
    next.uid === cachedSnapshot.uid &&
    next.loading === cachedSnapshot.loading &&
    next.error === cachedSnapshot.error &&
    next.entitlements.pro === cachedSnapshot.entitlements.pro &&
    next.entitlements.source === cachedSnapshot.entitlements.source &&
    (next.entitlements.expiresAt ?? null) === (cachedSnapshot.entitlements.expiresAt ?? null)
  ) {
    return;
  }
  cachedSnapshot = next;
  notify();
}

function normalizeExpiresAt(value: unknown): number | null | undefined {
  if (value == null) return value as null | undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof (value as any)?.toMillis === "function") {
    try {
      const ms = (value as any).toMillis();
      if (typeof ms === "number" && Number.isFinite(ms)) return ms;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function normalizeEntitlements(raw: unknown): Entitlements {
  const data = raw && typeof raw === "object" ? (raw as any) : {};
  const pro = data?.pro === true;
  const source =
    data?.source === "iap" ||
    data?.source === "stripe" ||
    data?.source === "admin" ||
    data?.source === "admin_allowlist"
      ? (data.source as Entitlements["source"])
      : undefined;
  const expiresAt = normalizeExpiresAt(data?.expiresAt);
  const out: Entitlements = { pro };
  if (source) out.source = source;
  if (expiresAt !== undefined) out.expiresAt = expiresAt;
  return out;
}

function detachDocListener() {
  if (unsubscribeDoc) {
    try {
      unsubscribeDoc();
    } catch {
      // ignore
    }
    unsubscribeDoc = null;
  }
}

function attachDocListener(uid: string) {
  detachDocListener();
  if (!firebaseDb) {
    setSnapshot({
      uid,
      entitlements: DEFAULT_ENTITLEMENTS,
      loading: false,
      error: "firestore_unavailable",
    });
    return;
  }

  setSnapshot({ uid, loading: true, error: null, entitlements: DEFAULT_ENTITLEMENTS });
  const ref = doc(firebaseDb, `users/${uid}/entitlements/current`);
  unsubscribeDoc = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        setSnapshot({ uid, entitlements: DEFAULT_ENTITLEMENTS, loading: false, error: null });
        return;
      }
      setSnapshot({
        uid,
        entitlements: normalizeEntitlements(snap.data()),
        loading: false,
        error: null,
      });
    },
    (err) => {
      // Fail closed (permission-denied included).
      setSnapshot({
        uid,
        entitlements: DEFAULT_ENTITLEMENTS,
        loading: false,
        error: err?.message ? String(err.message) : "entitlements_read_failed",
      });
    }
  );
}

function ensureListener() {
  if (unsubscribeAuth) return;
  void (async () => {
    unsubscribeAuth = await onAuthStateChanged((user) => {
      const nextUid = user?.uid ?? null;
      if (!nextUid) {
        activeUid = null;
        detachDocListener();
        setSnapshot({
          uid: null,
          entitlements: DEFAULT_ENTITLEMENTS,
          loading: false,
          error: null,
        });
        return;
      }
      if (activeUid === nextUid) return;
      activeUid = nextUid;
      attachDocListener(nextUid);
    });
  })();
}

function subscribe(listener: () => void) {
  ensureListener();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Snapshot {
  return cachedSnapshot;
}

function getServerSnapshot(): Snapshot {
  return { uid: null, entitlements: DEFAULT_ENTITLEMENTS, loading: true, error: null };
}

export function useEntitlements() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return snapshot;
}

