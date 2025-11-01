import React, { useEffect, useState } from "react";

import { toast } from "../lib/toast";
import {
  emailPasswordSignIn,
  googleSignIn,
  appleSignIn,
  describeAuthErrorAsync,
} from "../lib/login";
import { firebaseReady, getFirebaseAuth } from "../lib/firebase";
import {
  consumeAuthRedirect,
} from "../lib/auth";
import {
  consumeAuthRedirectError,
  consumeAuthRedirectResult,
  type FriendlyFirebaseError,
} from "../lib/authRedirect";
import { loadFirebaseAuthClientConfig, isProviderEnabled } from "../lib/firebaseAuthConfig";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [appleProviderEnabled, setAppleProviderEnabled] = useState<boolean | null>(null);
  const envEnableAppleRaw = import.meta.env.VITE_ENABLE_APPLE as string | undefined;
  const envEnableApple = typeof envEnableAppleRaw === "string"
    ? ["true", "1", "yes", "on"].includes(envEnableAppleRaw.trim().toLowerCase())
    : false;
  const showAppleButton = envEnableApple || appleProviderEnabled === true;

  useEffect(() => {
    let cancelled = false;
    loadFirebaseAuthClientConfig()
      .then((config) => {
        if (cancelled) return;
        setAppleProviderEnabled(isProviderEnabled("apple.com", config));
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.warn("[login] Unable to load Firebase Auth client config", error);
        }
        if (!cancelled) {
          setAppleProviderEnabled(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showAppleButton) return;
    if (typeof document === "undefined") return;
    const existing = document.querySelector<HTMLScriptElement>("script[data-apple-auth]");
    if (existing) return;
    try {
      const script = document.createElement("script");
      script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
      script.async = true;
      script.dataset.appleAuth = "true";
      script.onerror = () => {
        if (import.meta.env.DEV) {
          console.warn("[login] Failed to load Apple JS SDK");
        }
      };
      document.head.appendChild(script);
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn("[login] Unable to load Apple JS", err);
      }
    }
  }, [showAppleButton]);

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
            const auth = getFirebaseAuth();
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

  async function onEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !pass) {
      toast("Enter email and password.", "warn");
      return;
    }
    setBusy(true);
    try {
      const r = await emailPasswordSignIn(email, pass);
      if (!r.ok) {
        toast(formatError(r.message, r.code), "error");
      }
    } catch (err) {
      const normalized = normalizeFirebaseError(err);
      toast(formatError(normalized.message, normalized.code), "error");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    try {
      await firebaseReady();
      const auth = getFirebaseAuth();
      const r = await googleSignIn(auth);
      if (!r.ok) {
        const show = formatError(r.message, r.code);
        toast(show, "error");
      }
    } catch (err) {
      const normalized = normalizeFirebaseError(err);
      toast(formatError(normalized.message ?? "Google sign-in failed.", normalized.code), "error");
    } finally {
      setBusy(false);
    }
  }

  async function onApple() {
    setBusy(true);
    try {
      const r = await appleSignIn();
      if (!r.ok) {
        toast(formatError(r.message ?? "Apple sign-in failed.", r.code), "error");
      }
    } catch (err) {
      const normalized = normalizeFirebaseError(err);
      toast(formatError(normalized.message ?? "Apple sign-in failed.", normalized.code), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={wrap}>
      <h1 style={h1}>Sign in</h1>

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
        />

        <button type="submit" disabled={busy} style={btnPrimary}>
          {busy ? "Signing in…" : "Sign in with Email"}
        </button>
      </form>

      <div style={hr} />

      <div style={providers}>
        <button
          type="button"
          onClick={() => void onGoogle()}
          disabled={busy}
          style={btn}
          aria-label="Continue with Google"
        >
          Continue with Google
        </button>

        {appleAllowed && (
          <button
            type="button"
            onClick={() => void onApple()}
            disabled={busy}
            style={btn}
            aria-label="Continue with Apple"
          >
            Continue with Apple
          </button>
        )}
      </div>
    </div>
  );
}

function normalizeFirebaseError(err: unknown): { message?: string; code?: string } {
  if (!err) return {};
  if (typeof err === "string") {
    return { message: err };
  }
  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : undefined;
    const code = typeof record.code === "string" ? record.code : undefined;
    return { message, code };
  }
  return {};
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
