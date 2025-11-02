import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  initFirebase,
  signInWithApple,
  signInWithEmail,
  signInWithGoogle,
  signInDemo,
} from "@/lib/firebase";
import { consumeAuthRedirect } from "@/lib/auth";

type Flags = {
  google: boolean;
  apple: boolean;
  email: boolean;
  demo: boolean;
};

async function fetchHealth(): Promise<{ authProviders: Flags } | null> {
  const targets = ["/api/systemHealth", "/systemHealth"];
  for (const url of targets) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return (await response.json()) as { authProviders: Flags };
      }
    } catch {
      // ignore network errors and try the next endpoint
    }
  }
  return null;
}

export default function Login() {
  initFirebase();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const [flags, setFlags] = useState<Flags>({ google: true, apple: true, email: true, demo: true });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchHealth().then((result) => {
      if (!cancelled && result?.authProviders) {
        setFlags(result.authProviders);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const finish = () => {
    const target = consumeAuthRedirect() ?? from ?? "/";
    navigate(target, { replace: true });
  };

  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
      finish();
    } catch (e: any) {
      const message = typeof e?.message === "string" && e.message.length ? e.message : null;
      setErr(message ?? "Sign in failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      {flags.google && (
        <button
          className="w-full rounded border px-4 py-2 text-sm font-medium"
          disabled={busy}
          onClick={() => run(signInWithGoogle)}
        >
          Continue with Google
        </button>
      )}

      {flags.apple && (
        <button
          className="w-full rounded border px-4 py-2 text-sm font-medium"
          disabled={busy}
          onClick={() => run(signInWithApple)}
        >
          Continue with Apple
        </button>
      )}

      {flags.email && (
        <div className="mt-2 space-y-2">
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            type="email"
            placeholder="Email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={busy}
          />
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={busy}
          />
          <button
            className="w-full rounded border px-4 py-2 text-sm font-medium"
            disabled={busy || !email || !password}
            onClick={() => run(() => signInWithEmail(email.trim(), password))}
          >
            Continue with Email
          </button>
        </div>
      )}

      {flags.demo && (
        <button
          className="w-full rounded border px-4 py-2 text-sm font-medium"
          disabled={busy}
          onClick={() => run(signInDemo)}
        >
          Try Demo (no email)
        </button>
      )}

      {err && <p className="text-sm text-red-600">{err}</p>}

      <p className="text-xs text-muted-foreground">
        By continuing, you agree to our Terms and Privacy Policy.
      </p>
    </div>
  );
}
