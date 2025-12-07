import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth as firebaseAuth, db } from '../lib/firebase';

export function useNeedsOnboardingMBS() {
  const [loading, setLoading] = useState(true);
  const [needs, setNeeds] = useState(false);

  useEffect(() => {
    if (!firebaseAuth || !db) {
      setNeeds(false);
      setLoading(false);
      return undefined;
    }

    let unsubscribeMeta: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (u) => {
      if (unsubscribeMeta) {
        unsubscribeMeta();
        unsubscribeMeta = null;
      }

      if (!u) {
        setNeeds(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      const ref = doc(db, "users", u.uid, "meta", "onboarding");
      unsubscribeMeta = onSnapshot(
        ref,
        (snap) => {
          const done = snap.exists() && snap.data()?.completed === true;
          setNeeds(!done);
          setLoading(false);
        },
        () => {
          setNeeds(false);
          setLoading(false);
        },
      );
    });

    return () => {
      if (unsubscribeMeta) unsubscribeMeta();
      unsubscribeAuth();
    };
  }, []);

  return { loading, needs };
}