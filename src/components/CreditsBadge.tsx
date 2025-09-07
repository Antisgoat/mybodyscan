import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export function CreditsBadge() {
  const [credits, setCredits] = useState<number>(0);

  useEffect(() => {
    const auth = getAuth();
    let unsubDoc: (() => void) | undefined;
    const unsubAuth = auth.onAuthStateChanged((u) => {
      unsubDoc?.();
      if (!u) {
        setCredits(0);
        return;
      }
      const ref = doc(db, `users/${u.uid}/private/credits`);
      unsubDoc = onSnapshot(ref, (snap) => {
        const val = snap.data()?.creditsSummary?.totalAvailable as
          | number
          | undefined;
        setCredits(val ?? 0);
      });
    });
    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, []);

  return (
    <div className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
      Credits: {credits}
    </div>
  );
}
