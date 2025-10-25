import React, { useState } from "react";
import {
  emailPasswordSignIn,
  googleSignIn,
  appleSignIn,
  APPLE_WEB_ENABLED,
} from "../lib/login";
import { toast } from "../lib/toast";

export default function Login() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);

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
      const r = await googleSignIn();
      if (!r.ok) {
        const message = "message" in r && typeof r.message === "string" && r.message
          ? r.message
          : "Google sign-in failed.";
        toast(message, "error");
      }
    } catch (err) {
      const message = (err as { message?: string } | undefined)?.message || "Google sign-in failed.";
      toast(message, "error");
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
        <button type="button" onClick={() => void onGoogle()} disabled={busy} style={btn}>
          Continue with Google
        </button>

        {APPLE_WEB_ENABLED && (
          <button type="button" onClick={() => void onApple()} disabled={busy} style={btn}>
            Continue with Apple
          </button>
        )}
      </div>
    </div>
  );
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
