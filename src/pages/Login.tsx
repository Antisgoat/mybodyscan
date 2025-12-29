import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { auth, providerFlags, signInWithEmail } from "@/lib/firebase";
import { consumeAuthRedirect } from "@/lib/auth/redirectState";
import { disableDemoEverywhere } from "@/state/demo";
import { signInWithApple, signInWithGoogle } from "@/lib/auth/providers";
import { useAuthUser } from "@/lib/auth";

export default function Login() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );
  const nextParam = searchParams.get("next");
  const defaultTarget = nextParam || from || "/";

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { user, authReady } = useAuthUser();

  const finish = () => {
    const stored = consumeAuthRedirect();
    const target = stored ?? defaultTarget;
    disableDemoEverywhere();
    let sanitized = target;
    try {
      const url = new URL(target, window.location.origin);
      url.searchParams.delete("demo");
      sanitized = `${url.pathname}${url.search}${url.hash}` || "/";
    } catch {
      if (typeof target === "string" && target.includes("demo=")) {
        const [path] = target.split("?");
        sanitized = path || "/";
      }
    }
    window.location.replace(sanitized);
  };

  useEffect(() => {
    if (!auth) {
      setMsg("Authentication unavailable. Please reload or try again later.");
      return undefined;
    }

    if (authReady && (user || auth.currentUser)) {
      finish();
    }
    return undefined;
  }, [authReady, user]);

  async function wrap<T>(
    fn: () => Promise<T>,
    options?: { autoFinish?: boolean }
  ) {
    const { autoFinish = true } = options ?? {};
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (autoFinish) finish();
    } catch (e: any) {
      const normalized = normalizeFirebaseError(e);
      const message = normalized.message || "Sign-in failed";
      setMsg(message);
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
          onClick={() => wrap(() => signInWithGoogle(defaultTarget), { autoFinish: false })}
        >
          Continue with Google
        </button>
      )}

      {providerFlags.apple && (
        <button
          className="mb-3 w-full rounded border p-2"
          disabled={busy}
          onClick={() =>
            wrap(() => signInWithApple(defaultTarget), { autoFinish: false })
          }
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
            onClick={() => wrap(() => signInWithEmail(email, pass))}
          >
            Continue with Email
          </button>
        </div>
      )}

      <Link
        className="mb-3 block w-full rounded border p-2 text-center"
        to="/demo"
      >
        Browse demo
      </Link>

      {msg && <p className="mt-2 text-sm text-red-600">{msg}</p>}
      <p className="mt-4 text-xs text-gray-500">
        By continuing you agree to our Terms and Privacy Policy.
      </p>
    </div>
  );
}

function normalizeFirebaseError(err: unknown): {
  message?: string;
  code?: string;
} {
  if (!err) return {};
  if (typeof err === "string") return { message: err };
  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    const message =
      typeof record.message === "string" ? record.message : undefined;
    const code = typeof record.code === "string" ? record.code : undefined;
    if (message || code) return { message, code };
  }
  return {};
}
