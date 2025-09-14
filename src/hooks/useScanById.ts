import { useEffect, useState } from 'react';
import { onSnapshot, doc } from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';

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
  results?: {
    bfPercent?: number;
    bmi?: number;
    weightEstimate_kg?: number;
    insight?: string;
    confidence?: string;
  };
  [key: string]: any;
};

export function useScanById(scanId: string | undefined) {
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
    if (!user || !scanId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const scanDoc = doc(db, "users", user.uid, "scans", scanId);

    const unsubscribe = onSnapshot(
      scanDoc,
      (snapshot) => {
        if (snapshot.exists()) {
          setScan({ id: snapshot.id, ...snapshot.data() } as ScanData);
        } else {
          setScan(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Error fetching scan by ID:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, scanId]);

  return { scan, loading, error, user };
}