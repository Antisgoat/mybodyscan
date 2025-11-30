import { collection, limit, onSnapshot, orderBy, query, startAfter, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type ScanItem = {
  id: string;
  createdAt?: any;
  status?: string;
  results?: any;
  notes?: string;
};

export function scansColRef() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return collection(db, "users", uid, "scans");
}

/** Initial stream + manual 'load more' pagination using startAfter() */
export function listenLatest(setter: (items: ScanItem[]) => void, pageSize = 20) {
  const q = query(scansColRef(), orderBy("createdAt", "desc"), limit(pageSize));
  return onSnapshot(q, (snap) => setter(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))));
}

export async function loadMore(afterId: string, pageSize = 20): Promise<ScanItem[]> {
  // Get the doc to page after, then fetch next page
  const uid = auth.currentUser?.uid!;
  const afterRef = query(collection(db, "users", uid, "scans"), orderBy("createdAt", "desc"));
  const first = await getDocs(afterRef);
  const afterDoc = first.docs.find((d) => d.id === afterId);
  if (!afterDoc) return [];
  const nextQ = query(scansColRef(), orderBy("createdAt", "desc"), startAfter(afterDoc), limit(pageSize));
  const nextSnap = await getDocs(nextQ);
  return nextSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}
