import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getRemainingCredits } from "@/lib/credits";

export function CreditsBadge() {
  const [credits, setCredits] = useState<number>(0);
  const [unlimited, setUnlimited] = useState<boolean>(false);

  useEffect(() => {
    const auth = getAuth();
    let unsubDoc: (() => void) | undefined;
    const unsubAuth = auth.onAuthStateChanged((u) => {
      unsubDoc?.();
      if (!u) {
        setCredits(0);
        setUnlimited(false);
        return;
      }
      u.getIdTokenResult(true)
        .then((res) => setUnlimited(Boolean(res?.claims?.unlimitedCredits === true)))
        .catch(() => setUnlimited(false));
      getRemainingCredits(u.uid)
        .then(setCredits)
        .catch(() => setCredits(0));
      const creditsQuery = query(
        collection(db, "users", u.uid, "credits"),
        where("consumedAt", "==", null)
      );
      unsubDoc = onSnapshot(creditsQuery, (snap) => {
        const now = new Date();
        const remaining = snap.docs.filter((docSnap) => {
          const data = docSnap.data() as { expiresAt?: { toDate?: () => Date } };
          const expiresAt = data.expiresAt?.toDate?.();
          if (!expiresAt) return true;
          return expiresAt.getTime() > now.getTime();
        }).length;
        setCredits(remaining);
      });
    });
    return () => {
      unsubAuth();
      unsubDoc?.();
    };
  }, []);

  return (
    <div className="bg-muted px-3 py-1 rounded-full text-sm font-medium">
      Credits: {unlimited ? "∞" : credits}
    </div>
  );
}
