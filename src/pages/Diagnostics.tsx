import React, { useEffect, useState } from "react";
import { auth, envFlags } from "../lib/firebase";

export default function Diagnostics() {
  const [uid, setUid] = useState<string | null>(null);
  const [tokenLen, setTokenLen] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [health, setHealth] = useState<{
    stripeSecretSource: string | null;
    stripePublishablePresent: boolean;
    appCheckSiteKeyPresent: boolean;
  } | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/systemHealth");
        if (!response.ok) {
          throw new Error(`health_status_${response.status}`);
        }
        const json = (await response.json()) as {
          stripeSecretSource?: string | null;
          stripePublishablePresent?: boolean;
          appCheckSiteKeyPresent?: boolean;
        };
        if (cancelled) return;
        setHealth({
          stripeSecretSource: json?.stripeSecretSource ?? null,
          stripePublishablePresent: Boolean(json?.stripePublishablePresent),
          appCheckSiteKeyPresent: Boolean(json?.appCheckSiteKeyPresent),
        });
      } catch (error) {
        if (cancelled) return;
        setHealth({ stripeSecretSource: null, stripePublishablePresent: false, appCheckSiteKeyPresent: false });
      }
    })();
    return () => {
      cancelled = true;
    };
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
              stripeSecretSource: health?.stripeSecretSource ?? "unknown",
              stripePublishablePresent: health?.stripePublishablePresent ?? false,
              appCheckSiteKeyPresent: health?.appCheckSiteKeyPresent ?? false,
            },
            providers: envFlags,
          },
          null,
          2,
        )}
      </pre>
      <div style={{ marginTop: 12, fontSize: 12, color: "#475569" }}>
        <div>
          <strong>Stripe secret detected:</strong> {health?.stripeSecretSource ?? "unknown"}
        </div>
        <div>
          <strong>Publishable key:</strong> {health?.stripePublishablePresent ? "present" : "missing"}
        </div>
        <div>
          <strong>App Check site key:</strong> {health?.appCheckSiteKeyPresent ? "present" : "missing"}
        </div>
      </div>
      {err && <div style={{ color: "#b00020" }}>Error: {err}</div>}
    </div>
  );
}
