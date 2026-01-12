import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/auth/client";
import { useDemoMode } from "@/components/DemoModeProvider";

export type SubscriptionStatus =
  | "active"
  | "canceled"
  | "past_due"
  | "none"
  | string;

export interface SubscriptionInfo {
  status: SubscriptionStatus;
  product?: string | null;
  price?: string | null;
  updatedAt?: string | null;
}

export function useSubscription() {
  const { user } = useAuthUser();
  const demo = useDemoMode();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) {
      setSubscription(null);
      setLoading(false);
      return;
    }
    if (!user || !db) {
      setSubscription(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const ref = doc(db, "users", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const sub = (snap.data()?.subscription ||
          null) as SubscriptionInfo | null;
        if (sub) {
          setSubscription({
            status: (sub.status as SubscriptionStatus) || "none",
            product: sub.product ?? null,
            price: sub.price ?? null,
            updatedAt: (sub as any).updatedAt ?? null,
          });
        } else {
          setSubscription(null);
        }
        setError(null);
        setLoading(false);
      },
      (err) => {
        setError(err.message || "Failed to load subscription");
        setSubscription(null);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid, demo]);

  const status: SubscriptionStatus = subscription?.status ?? "none";
  const isActive = status === "active";

  return { subscription, status, isActive, loading, error } as const;
}
