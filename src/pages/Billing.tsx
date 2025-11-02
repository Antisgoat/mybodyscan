import React, { useEffect, useState } from "react";
import { onAuthStateChanged, getAuth } from "firebase/auth";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { createCheckout, createCustomerPortal } from "@/lib/api";

export default function Billing() {
  const [uid, setUid] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth();
    const db = getFirestore();
    let unsubscribeDoc: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid || null);
      if (unsubscribeDoc) {
        unsubscribeDoc();
        unsubscribeDoc = undefined;
      }
      if (user?.uid) {
        unsubscribeDoc = onSnapshot(doc(db, "users", user.uid), (snap) => {
          setCredits((snap.data()?.credits as number) ?? 0);
        });
      } else {
        setCredits(null);
      }
    });
    return () => {
      if (unsubscribeDoc) unsubscribeDoc();
      unsubscribeAuth();
    };
  }, []);

  async function go<T>(fn: () => Promise<T>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e: any) {
      setMsg(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold mb-4">Billing</h1>
      <p className="mb-4 text-sm text-gray-600">
        Credits let you run body scans. Subscriptions deposit credits every billing cycle.
      </p>
      <div className="mb-4">
        Current credits: <b>{credits ?? "…"}</b>
      </div>

      <div className="space-y-3">
        <button
          className="w-full border rounded p-2"
          disabled={busy || !uid}
          onClick={() =>
            go(async () => {
              const r = await createCheckout("scan", 1);
              window.location.href = r.url;
            })
          }
        >
          Buy 1 Scan Credit
        </button>

        <button
          className="w-full border rounded p-2"
          disabled={busy || !uid}
          onClick={() =>
            go(async () => {
              const r = await createCheckout("sub_monthly");
              window.location.href = r.url;
            })
          }
        >
          Subscribe — Monthly
        </button>

        <button
          className="w-full border rounded p-2"
          disabled={busy || !uid}
          onClick={() =>
            go(async () => {
              const r = await createCheckout("sub_annual");
              window.location.href = r.url;
            })
          }
        >
          Subscribe — Annual
        </button>

        <button
          className="w-full border rounded p-2"
          disabled={busy || !uid}
          onClick={() =>
            go(async () => {
              const r = await createCustomerPortal();
              window.location.href = r.url;
            })
          }
        >
          Manage Subscription
        </button>
      </div>

      {msg && <p className="text-red-600 text-sm mt-3">{msg}</p>}
    </div>
  );
}
