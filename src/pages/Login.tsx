import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { providerFlags, signInWithEmail } from "@/lib/firebase";
import { consumeAuthRedirect } from "@/lib/auth/redirectState";
import { disableDemoEverywhere, enableDemo } from "@/state/demo";
import { useAuthUser } from "@/lib/auth";
import { signInApple, signInGoogle } from "@/lib/authFacade";
import { reportError } from "@/lib/telemetry";
import { isNative } from "@/lib/platform";

export default function Login() {
  const location = useLocation();
  const native = isNative();
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
    // Never redirect an authenticated user back into auth routes.
    if (
      typeof sanitized === "string" &&
      (sanitized.startsWith("/login") ||
        sanitized.startsWith("/auth") ||
        sanitized.startsWith("/oauth"))
    ) {
      sanitized = "/home";
    }
    window.location.replace(sanitized);
  };

  useEffect(() => {
    if (authReady && user) {
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
    void reportError({
      kind: "auth.login_start",
      message: "auth.login_start",
      extra: { target: defaultTarget },
    });
    try {
      await fn();
      void reportError({
        kind: "auth.login_success",
        message: "auth.login_success",
        extra: { target: defaultTarget },
      });
      if (autoFinish) finish();
    } catch (e: any) {
      const normalized = normalizeFirebaseError(e);
      const message = normalized.message || "Sign-in failed";
      setMsg(message);
      void reportError({
        kind: "auth.login_failed",
        message: "auth.login_failed",
        extra: { code: normalized.code ?? null, message },
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="mb-4 text-2xl font-bold">Sign in</h1>

      {native && (
        <p className="mb-3 text-sm text-gray-600">
          Google/Apple sign-in is available on web. On iOS, please use
          email/password for now.
        </p>
      )}

      {!native && providerFlags.google && (
        <button
          className="mb-3 w-full rounded border p-2"
          disabled={busy}
          onClick={() =>
            wrap(() => signInGoogle(defaultTarget), { autoFinish: false })
          }
        >
          Continue with Google
        </button>
      )}

      {!native && providerFlags.apple && (
        <button
          className="mb-3 w-full rounded border p-2"
          disabled={busy}
          onClick={() =>
            wrap(() => signInApple(defaultTarget), { autoFinish: false })
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
        onClick={() => {
          // Durable demo enable (no auth / no network).
          enableDemo();
        }}
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
