import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, startAfter } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type ScanItem = {
  id: string;
  createdAt?: any;
  status?: string;
  results?: any;
  notes?: string;
};

export function scansColRef(uid: string) {
  if (!uid) throw new Error("Not signed in");
  return collection(db, "users", uid, "scans");
}

/** Initial stream + manual 'load more' pagination using startAfter() */
export function listenLatest(uid: string, setter: (items: ScanItem[]) => void, pageSize = 20) {
  const q = query(scansColRef(uid), orderBy("createdAt", "desc"), limit(pageSize));
  return onSnapshot(q, (snap) => setter(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))));
}

export async function loadMore(uid: string, afterId: string, pageSize = 20): Promise<ScanItem[]> {
  if (!uid) throw new Error("Not signed in");
  const afterDocRef = doc(db, "users", uid, "scans", afterId);
  const afterDoc = await getDoc(afterDocRef);
  if (!afterDoc.exists()) return [];
  const nextQ = query(scansColRef(uid), orderBy("createdAt", "desc"), startAfter(afterDoc), limit(pageSize));
  const nextSnap = await getDocs(nextQ);
  return nextSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}
