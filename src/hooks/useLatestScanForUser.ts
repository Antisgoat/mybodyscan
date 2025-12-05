import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { User } from 'firebase/auth';

import { auth, db, onAuthStateChangedSafe } from '@/lib/firebase';
import { demoLatestScan } from '@/lib/demoDataset';
import { isDemo } from '@/lib/demoFlag';

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
  const [user, setUser] = useState<User | null>(() => auth?.currentUser ?? null);

  useEffect(() => {
    const unsubAuth = onAuthStateChangedSafe((currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        if (isDemo()) {
          setScan(demoLatestScan as unknown as ScanData);
        } else {
          setScan(null);
        }
        setLoading(false);
        setError(null);
      }
    });

    return () => {
      unsubAuth();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      if (isDemo()) {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    setError(null);

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