import React, { useEffect, useState } from "react";

import { useFlags } from "@/lib/flags";
import { toast } from "../lib/toast";
import {
  emailPasswordSignIn,
  googleSignIn,
  appleSignIn,
  APPLE_WEB_ENABLED,
  describeAuthErrorAsync,
} from "../lib/login";
import { firebaseReady, getFirebaseAuth } from "../lib/firebase";
import {
  consumeAuthRedirect,
} from "../lib/auth";
import {
  consumeAuthRedirectError,
  consumeAuthRedirectResult,
} from "../lib/authRedirect";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const { flags, loaded } = useFlags();
  const appleAllowed = flags.enableApple || (!loaded && APPLE_WEB_ENABLED);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
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
        try {
          const auth = getFirebaseAuth();
          const mapped = await describeAuthErrorAsync(auth, error);
          toast(formatError(mapped.message, mapped.code), "error");
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn("[auth] Unable to surface redirect error", err);
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
        const message = "message" in r && typeof r.message === "string" && r.message
          ? r.message
          : "Email sign-in failed.";
        toast(message, "error");
      }
    } catch (err) {
      const message = (err as { message?: string } | undefined)?.message || "Email sign-in failed.";
      toast(message, "error");
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
      const message = (err as { message?: string } | undefined)?.message || "Google sign-in failed.";
      const show = formatError(message, (err as { code?: string } | undefined)?.code);
      toast(show, "error");
    } finally {
      setBusy(false);
    }
  }

  async function onApple() {
    setBusy(true);
    try {
      const r = await appleSignIn();
      if (!r.ok) {
        const message = "message" in r && typeof r.message === "string" && r.message
          ? r.message
          : "Apple sign-in failed.";
        toast(message, "error");
      }
    } catch (err) {
      const message = (err as { message?: string } | undefined)?.message || "Apple sign-in failed.";
      toast(message, "error");
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

function formatError(message: string, code?: string) {
  if (import.meta.env.DEV && code) {
    return `${message} (${code})`;
  }
  return message;
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
