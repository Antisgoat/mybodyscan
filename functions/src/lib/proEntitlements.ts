import { getFirestore } from "../firebase.js";

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (value && typeof (value as any).toMillis === "function") {
    try {
      const ms = (value as any).toMillis();
      if (typeof ms === "number" && Number.isFinite(ms)) return ms;
    } catch {
      // ignore
    }
  }
  return null;
}

export async function hasProEntitlement(uid: string): Promise<boolean> {
  const trimmed = String(uid || "").trim();
  if (!trimmed) return false;
  const db = getFirestore();
  const ref = db.doc(`users/${trimmed}/entitlements/current`);
  const snap = await ref.get().catch(() => null);
  if (!snap?.exists) return false;
  const data = snap.data() as any;
  if (data?.pro !== true) return false;
  const expiresAtMs = readNumber(data?.expiresAt);
  if (expiresAtMs == null) return true;
  return expiresAtMs > Date.now();
}

