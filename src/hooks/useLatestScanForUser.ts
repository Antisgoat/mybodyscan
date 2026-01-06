import { useEffect, useState } from "react";
import {
  onSnapshot,
  query,
  orderBy,
  limit,
  collection,
} from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import { isDemo } from "@/lib/demoFlag";
import { demoLatestScan } from "@/lib/demoDataset";
import { useAuthUser } from "@/lib/auth";

type ScanData = {
  id: string;
  status: string;
  bodyFatPercentage?: number;
  body_fat?: number;
  bodyfat?: number;
  weight?: number;
  weight_lbs?: number;
  bmi?: number;
  mediaUrl?: string;
  createdAt?: any;
  completedAt?: any;
  note?: string;
  [key: string]: any;
};

export function useLatestScanForUser() {
  const [scan, setScan] = useState<ScanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, authReady } = useAuthUser();

  useEffect(() => {
    if (!authReady) {
      setLoading(true);
      return;
    }
    if (!user) {
      if (isDemo()) {
        setScan(demoLatestScan as unknown as ScanData);
      } else {
        setScan(null);
      }
      setLoading(false);
      setError(null);
    }
  }, [authReady, user]);

  useEffect(() => {
    if (!user) {
      if (isDemo()) {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);

    if (!db) {
      setError("firestore_unavailable");
      setLoading(false);
      return;
    }

    const scansQuery = query(
      collection(db, "users", user.uid, "scans"),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsubscribe = onSnapshot(
      scansQuery,
      (snapshot) => {
        if (snapshot.empty) {
          setScan(null);
        } else {
          const doc = snapshot.docs[0];
          setScan({ id: doc.id, ...doc.data() } as ScanData);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching latest scan:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  return { scan, loading, error, user };
}
