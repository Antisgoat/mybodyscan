import React, { useEffect, useState } from "react";
import { auth, envFlags } from "../lib/firebase";

export default function Diagnostics() {
  const [uid, setUid] = useState<string | null>(null);
  const [tokenLen, setTokenLen] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      setUid(u?.uid || null);
      try {
        const t = u ? await u.getIdToken() : "";
        setTokenLen((t || "").length);
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    });
    return () => unsub();
  }, []);

  return (
    <div style={{ maxWidth: 680, margin: "24px auto", padding: 24 }}>
      <h2>Diagnostics</h2>
      <pre style={{ whiteSpace: "pre-wrap", background: "#fafafa", padding: 12, borderRadius: 8 }}>
        {JSON.stringify(
          {
            uid,
            tokenLen,
            env: {
              projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
              authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
              apiKeyPresent: !!import.meta.env.VITE_FIREBASE_API_KEY,
            },
            providers: envFlags,
          },
          null,
          2,
        )}
      </pre>
      {err && <div style={{ color: "#b00020" }}>Error: {err}</div>}
    </div>
  );
}
