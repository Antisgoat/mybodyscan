import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { useAuthUser } from "@/auth/mbs-auth";
import { db } from "@/lib/firebase";
import type { ScanDocument } from "@/lib/api/scan";
import { isSuccessfulPersistedScan } from "@/lib/scanContract";

/** Keep nutrition guidance anchored to the newest real result, even while a
 * subsequent scan is processing or has failed. */
export function useLatestSuccessfulScan() {
  const { user } = useAuthUser();
  const [scan, setScan] = useState<ScanDocument | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setScan(null);
      return;
    }
    const scans = query(
      collection(db, "users", user.uid, "scans"),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    return onSnapshot(
      scans,
      (snapshot) => {
        const latest = snapshot.docs
          .map((row) => ({ id: row.id, ...row.data() }) as ScanDocument)
          .find(isSuccessfulPersistedScan);
        setScan(latest ?? null);
      },
      () => setScan(null)
    );
  }, [user?.uid]);

  return scan;
}
