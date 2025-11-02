import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { auth, googleProvider, appleProvider, providerFlags } from "@/lib/firebase";
import {
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  signInAnonymously,
} from "firebase/auth";
import { consumeAuthRedirect } from "@/lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    const target = consumeAuthRedirect() ?? from ?? "/";
    navigate(target, { replace: true });
  };

  async function wrap<T>(fn: () => Promise<T>, options?: { autoFinish?: boolean }) {
    const { autoFinish = true } = options ?? {};
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (autoFinish) finish();
    } catch (e: any) {
      const message = typeof e?.message === "string" && e.message.length ? e.message : null;
      setMsg(message ?? "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-bold">Sign in</h1>

      {providerFlags.google && (
        <button
          className="mb-3 w-full rounded border p-2"
          disabled={busy}
          onClick={() => wrap(() => signInWithPopup(auth, googleProvider))}
        >
          Continue with Google
        </button>
      )}

      {providerFlags.apple && (
        <button
          className="mb-3 w-full rounded border p-2"
          disabled={busy}
          onClick={() => wrap(() => signInWithRedirect(auth, appleProvider), { autoFinish: false })}
        >
          Continue with Apple
        </button>
      )}

      {providerFlags.email && (
        <div className="mb-4">
          <input
            className="mb-2 w-full rounded border p-2"
            placeholder="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
          <input
            className="mb-2 w-full rounded border p-2"
            placeholder="Password"
            type="password"
            autoComplete="current-password"
            value={pass}
            onChange={(event) => setPass(event.target.value)}
            disabled={busy}
          />
          <button
            className="w-full rounded border p-2"
            disabled={busy}
            onClick={() => wrap(() => signInWithEmailAndPassword(auth, email, pass))}
          >
            Continue with Email
          </button>
        </div>
      )}

      {providerFlags.demo && (
        <button
          className="mb-3 w-full rounded border p-2"
          disabled={busy}
          onClick={() => wrap(() => signInAnonymously(auth))}
        >
          Try Demo (no account)
        </button>
      )}

      {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
      <p className="mt-4 text-xs text-gray-500">By continuing you agree to our Terms and Privacy Policy.</p>
    </div>
  );
}
