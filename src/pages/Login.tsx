import React, { useEffect, useState } from "react";

import { toast } from "../lib/toast";
import { describeAuthError, describeAuthErrorAsync } from "../lib/login";
import { firebaseReady, auth } from "@/lib/firebase";
import {
  consumeAuthRedirect,
} from "../lib/auth";
import {
  consumeAuthRedirectError,
  consumeAuthRedirectResult,
  type FriendlyFirebaseError,
} from "../lib/authRedirect";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithRedirect,
  signInWithPopup,
  signInWithEmailAndPassword,
  signInAnonymously,
} from "firebase/auth";

// env flags default to TRUE if undefined
const readBool = (v: any, def = true) =>
  v === "false" || v === false ? false : v === "true" || v === true ? true : def;

const ENABLE_GOOGLE = readBool((import.meta as any).env?.VITE_ENABLE_GOOGLE, true);
const ENABLE_APPLE = readBool((import.meta as any).env?.VITE_ENABLE_APPLE, true);
const ENABLE_EMAIL = readBool((import.meta as any).env?.VITE_ENABLE_EMAIL, true);
const ENABLE_DEMO = readBool((import.meta as any).env?.VITE_ENABLE_DEMO, true);

// Prefer redirect on mobile browsers to avoid popup blockers
const useRedirect =
  typeof navigator !== "undefined" && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

async function withUiErrors<T>(op: () => Promise<T>) {
  try {
    return await op();
  } catch (e: any) {
    const code = e?.code || "auth/unknown";
    let message = describeAuthError(e).message;
    try {
      const mapped = await describeAuthErrorAsync(auth, e);
      if (mapped?.message) {
        message = mapped.message;
      }
    } catch {
      // ignore secondary mapping failures
    }
    const formatted = formatError(message, code);
    try {
      toast(formatted, "error");
    } catch {
      if (typeof alert === "function") {
        alert(`${code}: ${message ?? "Sign-in failed"}`);
      }
    }
    throw e;
  }
}

export async function handleGoogle() {
  await firebaseReady();
  const provider = new GoogleAuthProvider();
  return withUiErrors(() =>
    useRedirect ? signInWithRedirect(auth, provider) : signInWithPopup(auth, provider)
  );
}

export async function handleApple() {
  await firebaseReady();
  const provider = new OAuthProvider("apple.com");
  provider.addScope("email");
  provider.addScope("name");
  return withUiErrors(() =>
    useRedirect ? signInWithRedirect(auth, provider) : signInWithPopup(auth, provider)
  );
}

export async function handleEmail(email: string, password: string) {
  await firebaseReady();
  return withUiErrors(() => signInWithEmailAndPassword(auth, email, password));
}

export async function handleDemo() {
  await firebaseReady();
  return withUiErrors(() => signInAnonymously(auth));
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await firebaseReady();
      const result = await consumeAuthRedirectResult();
      if (!cancelled && result) {
        const target = consumeAuthRedirect();
        if (target) {
          window.location.replace(target);
          return;
        }
      }

      const error = await consumeAuthRedirectError();
      if (!cancelled && error) {
        consumeAuthRedirect();
        const friendly = error as FriendlyFirebaseError;
        const friendlyMessage = friendly.friendlyMessage ?? null;
        const friendlyCode = friendly.friendlyCode ?? error.code;
        if (friendlyMessage) {
          toast(formatError(friendlyMessage, friendlyCode), "error");
        } else {
          try {
            const mapped = await describeAuthErrorAsync(auth, error);
            toast(formatError(mapped.message, mapped.code ?? friendlyCode), "error");
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn("[auth] Unable to surface redirect error", err);
            }
            const fallback = error.message || "Sign-in failed. Please try again.";
            toast(formatError(fallback, friendlyCode), "error");
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runAuthFlow(op: () => Promise<unknown>, provider: string | null = null) {
    setBusy(true);
    setActiveProvider(provider);
    try {
      await op();
      const target = consumeAuthRedirect();
      if (target) {
        window.location.replace(target);
      }
    } catch {
      // handled upstream by withUiErrors
    } finally {
      setActiveProvider(null);
      setBusy(false);
    }
  }

  async function onEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !pass) {
      toast("Enter email and password.", "warn");
      return;
    }
    await runAuthFlow(() => handleEmail(email, pass), "email");
  }

  return (
    <div style={wrap}>
      <h1 style={h1}>Sign in</h1>

      {ENABLE_EMAIL && (
        <form onSubmit={onEmailSignIn} style={form}>
          <label htmlFor="email" style={lab}>
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inp}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={busy}
          />

          <label htmlFor="pass" style={lab}>
            Password
          </label>
          <input
            id="pass"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            style={inp}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={busy}
          />

          <button type="submit" disabled={busy} style={btnPrimary}>
            {activeProvider === "email" ? "Signing in…" : "Sign in with Email"}
          </button>
        </form>
      )}

      <div style={hr} />

      <div style={providers}>
        {ENABLE_GOOGLE && (
          <button
            type="button"
            onClick={() => void runAuthFlow(() => handleGoogle(), "google")}
            disabled={busy}
            style={btn}
            aria-label="Continue with Google"
          >
            {activeProvider === "google" ? "Continuing…" : "Continue with Google"}
          </button>
        )}
        {ENABLE_APPLE && (
          <button
            type="button"
            onClick={() => void runAuthFlow(() => handleApple(), "apple")}
            disabled={busy}
            style={btn}
            aria-label="Continue with Apple"
          >
            {activeProvider === "apple" ? "Continuing…" : "Continue with Apple"}
          </button>
        )}
        {ENABLE_DEMO && (
          <button
            type="button"
            onClick={() => void runAuthFlow(() => handleDemo(), "demo")}
            disabled={busy}
            style={btnSecondary}
            aria-label="Try Demo"
          >
            {activeProvider === "demo" ? "Preparing demo…" : "Try Demo"}
          </button>
        )}
      </div>
    </div>
  );
}

function cleanFirebaseMessage(message?: string): string | undefined {
  if (!message) return undefined;
  let cleaned = message.replace(/^Firebase:\s*/i, "");
  cleaned = cleaned.replace(/\s*\(auth\/[\w-]+\)\.?$/i, "").trim();
  return cleaned || undefined;
}

function formatError(message?: string, code?: string) {
  const cleaned = cleanFirebaseMessage(message) ?? message ?? "Firebase sign-in failed.";
  if (code) {
    return `${cleaned} (${code})`;
  }
  return cleaned;
}

/* minimal inline styles */
const wrap: React.CSSProperties = { maxWidth: 420, margin: "40px auto", display: "grid", gap: 12 };
const h1: React.CSSProperties = { fontSize: 22, margin: 0 };
const form: React.CSSProperties = { display: "grid", gap: 8 };
const lab: React.CSSProperties = { fontSize: 12, color: "#555" };
const inp: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 8,
  fontSize: 14,
};
const btnPrimary: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "white",
  cursor: "pointer",
};
const hr: React.CSSProperties = { borderTop: "1px solid #eee", margin: "8px 0" };
const providers: React.CSSProperties = { display: "grid", gap: 8 };
const btn: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "white",
  cursor: "pointer",
};
const btnSecondary: React.CSSProperties = { ...btn, background: "#f5f5f5" };
