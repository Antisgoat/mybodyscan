import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase.ts';

export function useNeedsOnboardingMBS() {
  const [loading, setLoading] = useState(true);
  const [needs, setNeeds] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { setNeeds(false); setLoading(false); return; }
      try {
        const snap = await getDoc(doc(db, `users/${u.uid}/meta/onboarding`));
        const done = snap.exists() && snap.data()?.completed === true;
        setNeeds(!done);
      } catch { setNeeds(false); }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return { loading, needs };
}