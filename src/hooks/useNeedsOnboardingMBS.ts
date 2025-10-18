import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getSequencedAuth } from '../lib/firebase/init';

export function useNeedsOnboardingMBS() {
  const [loading, setLoading] = useState(true);
  const [needs, setNeeds] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    let cancelled = false;

    void (async () => {
      const auth = await getSequencedAuth();
      if (cancelled) return;
      unsub = onAuthStateChanged(auth, async (u) => {
        if (!u) { setNeeds(false); setLoading(false); return; }
        try {
          const snap = await getDoc(doc(db, `users/${u.uid}/meta/onboarding`));
          const done = snap.exists() && snap.data()?.completed === true;
          setNeeds(!done);
        } catch { setNeeds(false); }
        setLoading(false);
      });
    })();

    return () => {
      cancelled = true;
      if (unsub) unsub();
    };
  }, []);

  return { loading, needs };
}