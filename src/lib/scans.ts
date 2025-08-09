// src/lib/scans.ts
import { db } from "../firebaseConfig";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
  type DocumentData,
} from "firebase/firestore";

export function scansColPath(uid: string) {
  return collection(db, "users", uid, "scans");
}

// Realtime listener for History list
export function listenUserScans(
  uid: string,
  cb: (rows: DocumentData[]) => void,
  onErr?: (e: any) => void
) {
  const q = query(scansColPath(uid), orderBy("createdAt", "desc"), limit(50));
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (e) => onErr?.(e)
  );
}

// One latest scan (for Home card)
export async function getLastScan(uid: string) {
  const q = query(scansColPath(uid), orderBy("createdAt", "desc"), limit(1));
  const snap = await getDocs(q);
  const doc = snap.docs[0];
  return doc ? { id: doc.id, ...doc.data() } : null;
}
