import { useEffect, useState } from 'react';
import { onSnapshot, query, orderBy, limit, collection } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '@app/lib/firebase.ts';

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
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setScan(null);
        setLoading(false);
        setError(null);
      }
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

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