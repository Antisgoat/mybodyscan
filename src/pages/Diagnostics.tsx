import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth } from "../lib/firebase";
import { fetchClaims } from "../lib/claims";
import { BUILD } from "../lib/buildInfo";
import {
  APPCHECK_SITE_KEY,
  DEMO_ENABLED,
  OFF_ENABLED,
  SHOW_APPLE_WEB,
  STRIPE_PUBLISHABLE_KEY,
  SW_ENABLED,
  USDA_API_KEY,
} from "../lib/flags";
import { ensureAppCheck, getAppCheckHeader } from "../lib/appCheck";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../lib/firebase";
import { toast } from "../lib/toast";

type InitInfo = { projectId?: string; authDomain?: string; apiKey?: string };
type ItkInfo = { status?: number; authorizedDomains?: string[] };
type SwInfo = { controller: boolean; regs: number; caches: string[] };

type Claims = Record<string, unknown> | null;

export default function Diagnostics() {
  const [initInfo, setInitInfo] = useState<InitInfo>({});
  const [itk, setItk] = useState<ItkInfo>({});
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [claims, setClaims] = useState<Claims>(null);
  const [swInfo, setSwInfo] = useState<SwInfo>({ controller: false, regs: 0, caches: [] });
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState<string>("");
  const [appCheckProbe, setAppCheckProbe] = useState<string>("—");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => {
      unsub();
    };
  }, []);

  const maskedKey = useMemo(() => {
    const k = initInfo.apiKey ?? "";
    if (!k) return "";
    if (k.length <= 8) return "********";
    return `${k.slice(0, 4)}••••${k.slice(-4)}`;
  }, [initInfo.apiKey]);

  const probe = useCallback(async () => {
    setBusy(true);
    setNow(new Date().toISOString());

    try {
      // init.json
      try {
        const res = await fetch(`/__/firebase/init.json?ts=${Date.now()}`, { cache: "no-store" });
        const data: InitInfo = await res.json().catch(() => ({}));
        setInitInfo({ projectId: data?.projectId, authDomain: data?.authDomain, apiKey: data?.apiKey });

        if (data?.apiKey) {
          try {
            const url = `https://identitytoolkit.googleapis.com/v2/projects/mybodyscan-f3daf/config?key=${encodeURIComponent(data.apiKey)}`;
            const itkRes = await fetch(url, { mode: "cors" });
            const itkJson = await itkRes.json().catch(() => ({}));
            const domains = Array.isArray(itkJson?.authorizedDomains) ? itkJson.authorizedDomains : undefined;
            setItk({ status: itkRes.status, authorizedDomains: domains });
          } catch {
            setItk({ status: undefined, authorizedDomains: undefined });
          }
        } else {
          setItk({ status: undefined, authorizedDomains: undefined });
        }
      } catch {
        setInitInfo({});
        setItk({});
      }

      // SW + caches
      try {
        const nav = typeof navigator !== "undefined" ? navigator : undefined;
        const controller = Boolean(nav?.serviceWorker?.controller);
        const regs = nav?.serviceWorker ? (await nav.serviceWorker.getRegistrations()).length : 0;
        let keys: string[] = [];
        if (typeof caches !== "undefined") {
          try {
            keys = await caches.keys();
          } catch {
            keys = [];
          }
        }
        setSwInfo({ controller, regs, caches: keys });
      } catch {
        setSwInfo({ controller: false, regs: 0, caches: [] });
      }

      // claims
      try {
        const c = await fetchClaims();
        setClaims(c ?? null);
      } catch {
        setClaims(null);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const onRefresh = useCallback(async () => {
    await probe();
  }, [probe]);

  const onRefreshClaims = useCallback(async () => {
    try {
      const callable = httpsCallable(functions, "refreshClaims");
      const res = await callable({ reason: "diagnostics" }).catch(() => null);
      // force token refresh to pick up new claims
      try {
        await auth.currentUser?.getIdToken(true);
      } catch {
        // ignore
      }
      const c = await fetchClaims();
      setClaims(c ?? null);
      const updated = (res && typeof res === "object" && "data" in (res as any) && (res as any).data?.updated) ? Boolean((res as any).data.updated) : false;
      const unlimited = (res && typeof res === "object" && "data" in (res as any) && (res as any).data?.unlimitedCredits) ? Boolean((res as any).data.unlimitedCredits) : false;
      toast(updated ? `Claims refreshed. unlimitedCredits=${String(unlimited)}` : `Claims checked. unlimitedCredits=${String(unlimited)}`, updated ? "success" : "info");
    } catch {
      toast("Failed to refresh claims", "error");
    }
  }, []);

  const onKillSw = useCallback(async () => {
    try {
      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      const hadController = Boolean(nav?.serviceWorker?.controller);
      if (nav?.serviceWorker) {
        const regs = await nav.serviceWorker.getRegistrations();
        for (const reg of regs) {
          try {
            await reg.unregister();
          } catch {
            // noop
          }
        }
      }
      const cacheStorage = typeof caches !== "undefined" ? caches : undefined;
      if (cacheStorage) {
        try {
          const keys = await cacheStorage.keys();
          for (const key of keys) {
            if (/^(workbox|firebase-|vite-|app-cache)/i.test(key)) {
              try {
                await cacheStorage.delete(key);
              } catch {
                // ignore
              }
            }
          }
        } catch {
          // ignore
        }
      }
      if (hadController) {
        if (typeof window !== "undefined") {
          setTimeout(() => {
            try {
              window.location.reload();
            } catch {
              // ignore
            }
          }, 50);
        }
      } else {
        await probe();
      }
    } catch {
      // ignore
    }
  }, [probe]);

  const onProbeAppCheck = useCallback(async () => {
    try {
      await ensureAppCheck();
      const h = await getAppCheckHeader(true);
      setAppCheckProbe(h["X-Firebase-AppCheck"] ? "present" : "missing");
    } catch {
      setAppCheckProbe("missing");
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  return (
    <div style={wrap}>
      <h1 style={h1}>Diagnostics</h1>
      <div style={row}>
        <button type="button" onClick={() => void onRefresh()} disabled={busy} style={btn}>
          {busy ? "Refreshing…" : "Refresh Checks"}
        </button>
        <button type="button" onClick={() => void onRefreshClaims()} style={btn}>
          Force Claims Refresh
        </button>
        <button type="button" onClick={() => void onKillSw()} style={btnDanger}>
          Unregister SW + Clear caches
        </button>
      </div>
      <div style={time}>Checked at: {now || "—"}</div>

      <Section title="init.json">
        <KV k="projectId" v={initInfo.projectId} />
        <KV k="authDomain" v={initInfo.authDomain} />
        <KV k="apiKey(masked)" v={maskedKey || "—"} />
        <A href="/__/firebase/init.json?ts=1" text="Open init.json" />
      </Section>

      <Section title="Identity Toolkit">
        <KV k="HTTP status" v={itk.status != null ? String(itk.status) : "—"} />
        <KV k="authorizedDomains" v={itk.authorizedDomains?.join(", ") || "—"} />
        {initInfo.apiKey ? (
          <A
            href={`https://identitytoolkit.googleapis.com/v2/projects/mybodyscan-f3daf/config?key=${encodeURIComponent(initInfo.apiKey)}`}
            text="Open ITK config (v2)"
          />
        ) : null}
      </Section>

      <Section title="Auth">
        <KV k="uid" v={user?.uid || "—"} />
        <KV k="email" v={user?.email || (user ? "(no email)" : "—")} />
        <KV k="isAnonymous" v={user ? String(Boolean(user.isAnonymous)) : "—"} />
      </Section>

      <Section title="Claims">
        <pre style={pre}>{JSON.stringify(claims ?? {}, null, 2)}</pre>
      </Section>

      <Section title="Flags">
        <KV k="DEMO_ENABLED" v={String(DEMO_ENABLED)} />
        <KV k="SHOW_APPLE_WEB" v={String(SHOW_APPLE_WEB)} />
        <KV k="SW_ENABLED" v={String(SW_ENABLED)} />
        <KV k="APPCHECK_SITE_KEY" v={String(Boolean(APPCHECK_SITE_KEY))} />
        <div style={row}>
          <button type="button" onClick={() => void onProbeAppCheck()} style={btn}>
            Check App Check token
          </button>
          <div style={vStyle}>token: {appCheckProbe}</div>
        </div>
        <KV k="STRIPE_PUBLISHABLE_KEY" v={String(Boolean(STRIPE_PUBLISHABLE_KEY))} />
        <KV k="USDA_API_KEY" v={String(Boolean(USDA_API_KEY))} />
        <KV k="OFF_ENABLED" v={String(OFF_ENABLED)} />
      </Section>

      <Section title="Build">
        <KV k="commit" v={BUILD.commit || "—"} />
        <KV k="branch" v={BUILD.branch || "—"} />
        <KV k="builtAt" v={BUILD.builtAt || "—"} />
        <KV k="version" v={BUILD.version || "—"} />
      </Section>

      <Section title="Service Worker & Caches">
        <KV k="controller" v={String(swInfo.controller)} />
        <KV k="registrations" v={String(swInfo.regs)} />
        <div style={kv}>
          <div style={k}>cache keys</div>
          <div style={vStyle}>
            <pre style={pre}>{JSON.stringify(swInfo.caches, null, 2)}</pre>
          </div>
        </div>
      </Section>
    </div>
  );
}

type SectionProps = { title: string; children: ReactNode };

type KeyValueProps = { k: string; v?: string };

type LinkProps = { href: string; text: string };

function Section({ title, children }: SectionProps) {
  return (
    <section style={sec}>
      <h2 style={h2}>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function KV({ k: key, v }: KeyValueProps) {
  return (
    <div style={kv}>
      <div style={k}>{key}</div>
      <div style={vStyle}>{v || "—"}</div>
    </div>
  );
}

function A({ href, text }: LinkProps) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={link}>
      {text}
    </a>
  );
}

/* styles */
const wrap: CSSProperties = { maxWidth: 960, margin: "24px auto", padding: "0 12px", display: "grid", gap: 16 };
const h1: CSSProperties = { fontSize: 22, margin: 0 };
const h2: CSSProperties = { fontSize: 16, margin: "12px 0 8px 0" };
const row: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
const btn: CSSProperties = { padding: "8px 10px", border: "1px solid #ddd", borderRadius: 8, background: "white", cursor: "pointer", fontSize: 12 };
const btnDanger: CSSProperties = { padding: "8px 10px", border: "1px solid #f5b5b5", borderRadius: 8, background: "#fff5f5", cursor: "pointer", fontSize: 12 };
const time: CSSProperties = { fontSize: 12, color: "#666" };
const sec: CSSProperties = { border: "1px solid #eee", borderRadius: 12, padding: 12, background: "white" };
const kv: CSSProperties = { display: "grid", gridTemplateColumns: "160px 1fr", gap: 8, alignItems: "start", padding: "4px 0" };
const k: CSSProperties = { fontSize: 12, color: "#555" };
const vStyle: CSSProperties = { fontSize: 12, color: "#111", wordBreak: "break-word" };
const pre: CSSProperties = { margin: 0, fontSize: 12 };
const link: CSSProperties = { display: "inline-block", fontSize: 12, marginTop: 6, textDecoration: "underline" };
