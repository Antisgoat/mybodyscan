import React, { useState } from "react";
import { auth, envFlags } from "../lib/firebase";
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInAnonymously,
  signInWithPopup,
  signOut,
} from "firebase/auth";

export default function LoginPanel() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doGoogle = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e: any) {
      setError(e?.code || e?.message || "google_signin_failed");
    } finally {
      setBusy(false);
    }
  };

  const doApple = async () => {
    setError(null);
    setBusy(true);
    try {
      const provider = new OAuthProvider("apple.com");
      provider.addScope("email");
      provider.addScope("name");
      await signInWithPopup(auth, provider);
    } catch (e: any) {
      setError(e?.code || e?.message || "apple_signin_failed");
    } finally {
      setBusy(false);
    }
  };

  const doDemo = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInAnonymously(auth);
    } catch (e: any) {
      setError(e?.code || e?.message || "anonymous_not_enabled");
    } finally {
      setBusy(false);
    }
  };

  const doSignOut = async () => {
    setError(null);
    setBusy(true);
    try {
      await signOut(auth);
    } catch (e: any) {
      setError(e?.code || e?.message || "signout_failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        maxWidth: 480,
        margin: "40px auto",
        padding: 24,
        border: "1px solid #eee",
        borderRadius: 12,
      }}
    >
      <h2>Sign in</h2>
      <p style={{ opacity: 0.7, marginTop: 4 }}>Choose a method below.</p>

      {envFlags.enableGoogle && (
        <button disabled={busy} onClick={doGoogle} style={{ width: "100%", padding: 12, marginTop: 12 }}>
          Continue with Google
        </button>
      )}
      {envFlags.enableApple && (
        <button disabled={busy} onClick={doApple} style={{ width: "100%", padding: 12, marginTop: 12 }}>
          Continue with Apple
        </button>
      )}
      {envFlags.enableDemo && (
        <button disabled={busy} onClick={doDemo} style={{ width: "100%", padding: 12, marginTop: 12 }}>
          Try Demo (Anonymous)
        </button>
      )}
      <button disabled={busy} onClick={doSignOut} style={{ width: "100%", padding: 12, marginTop: 12 }}>
        Sign out
      </button>

      {!!error && <div style={{ marginTop: 12, color: "#b00020" }}>Error: {String(error)}</div>}

      <div style={{ marginTop: 16, fontSize: 12, opacity: 0.7 }}>
        If you see operation-not-allowed, enable that provider in Firebase Console → Authentication.
      </div>
    </div>
  );
}
