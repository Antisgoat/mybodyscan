import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";

interface Subscription {
  status: "active" | "inactive" | "cancelled";
  plan?: string;
  currentPeriodEnd?: Date;
}

export function useSubscription() {
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      if (!u) {
        setSubscription(null);
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!uid || !isFirebaseConfigured) return;

    setLoading(true);
    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data();
        if (data?.subscription) {
          setSubscription({
            status: data.subscription.status || "inactive",
            plan: data.subscription.plan,
            currentPeriodEnd: data.subscription.currentPeriodEnd?.toDate?.(),
          });
        } else {
          setSubscription({ status: "inactive" });
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching subscription:", err);
        setSubscription({ status: "inactive" });
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid]);

  return { subscription, loading };
}