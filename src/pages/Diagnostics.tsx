import React, { useEffect, useState } from "react";
import {
  envFlags,
  getAuthPersistenceMode,
  getFirebaseConfig,
} from "../lib/firebase";
import { useAuthUser } from "@/lib/auth";
import { isIOSSafari } from "@/lib/isIOSWeb";
import { getInitAuthState } from "@/lib/auth/initAuth";

export default function Diagnostics() {
  const [tokenLen, setTokenLen] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);
  const [health, setHealth] = useState<{
    stripeSecretSource: string | null;
    stripePublishablePresent: boolean;
    appCheckSiteKeyPresent: boolean;
  } | null>(null);
  const { user, authReady } = useAuthUser();
  const cfg = getFirebaseConfig();
  const persistence = getAuthPersistenceMode();
  const initState = getInitAuthState();
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const authDomain = String(cfg?.authDomain || "").trim();
  const authDomainMismatch =
    import.meta.env.PROD &&
    Boolean(host) &&
    Boolean(authDomain) &&
    host.toLowerCase() !== authDomain.toLowerCase();
  const iosSafari = isIOSSafari();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!authReady || !user) {
        if (!cancelled) setTokenLen(0);
        return;
      }
      try {
        const t = await user.getIdToken();
        if (!cancelled) setTokenLen((t || "").length);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

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
        setHealth({
          stripeSecretSource: null,
          stripePublishablePresent: false,
          appCheckSiteKeyPresent: false,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: 680, margin: "24px auto", padding: 24 }}>
      <h2>Diagnostics</h2>
      <pre
        style={{
          whiteSpace: "pre-wrap",
          background: "#fafafa",
          padding: 12,
          borderRadius: 8,
        }}
      >
        {JSON.stringify(
          {
            authReady,
            uid: user?.uid || "signed-out",
            tokenLen,
            runtime: {
              origin,
              host,
              isIOSSafari: iosSafari,
            },
            firebase: {
              projectId: cfg?.projectId ?? null,
              authDomain,
              persistence,
              initAuth: initState,
              authDomainMismatch,
            },
            env: {
              projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
              authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
              apiKeyPresent: !!import.meta.env.VITE_FIREBASE_API_KEY,
              stripeSecretSource: health?.stripeSecretSource ?? "unknown",
              stripePublishablePresent:
                health?.stripePublishablePresent ?? false,
              appCheckSiteKeyPresent: health?.appCheckSiteKeyPresent ?? false,
            },
            providers: envFlags,
          },
          null,
          2
        )}
      </pre>
      {authDomainMismatch ? (
        <div style={{ marginTop: 12, color: "#b00020", fontSize: 12 }}>
          <strong>Auth misconfiguration:</strong> Firebase authDomain must match
          this site (<code>{host}</code>) for reliable iOS Safari + WebView
          redirects. Current authDomain is <code>{authDomain}</code>.
        </div>
      ) : null}
      <div style={{ marginTop: 12, fontSize: 12, color: "#475569" }}>
        <div>
          <strong>Stripe secret detected:</strong>{" "}
          {health?.stripeSecretSource ?? "unknown"}
        </div>
        <div>
          <strong>Publishable key:</strong>{" "}
          {health?.stripePublishablePresent ? "present" : "missing"}
        </div>
        <div>
          <strong>App Check site key:</strong>{" "}
          {health?.appCheckSiteKeyPresent ? "present" : "missing"}
        </div>
      </div>
      {err && <div style={{ color: "#b00020" }}>Error: {err}</div>}
    </div>
  );
}
