import React, { useState } from "react";
import { signInApple, signInGoogle } from "@/lib/authFacade";
import { signInEmailPassword } from "@/lib/authFacade";
import { enableDemo } from "@/state/demo";
import { isNativeCapacitor } from "@/lib/platform";

const on = (k: string, def = false) => {
  const v = (import.meta as any).env?.[k];
  if (v === "true") return true;
  if (v === "false") return false;
  return def;
};

const ENABLE_GOOGLE = on("VITE_ENABLE_GOOGLE", true);
const ENABLE_APPLE = on("VITE_ENABLE_APPLE", true);
const ENABLE_EMAIL = on("VITE_ENABLE_EMAIL", true);
const ENABLE_DEMO = on("VITE_ENABLE_DEMO", true);

export default function LoginPanel() {
  const [loading, setLoading] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const native = isNativeCapacitor();

  async function withLoad<T>(label: string, fn: () => Promise<T>) {
    setLoading(label);
    try {
      return await fn();
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mx-auto max-w-sm p-6 space-y-3">
      <h1 className="text-2xl font-semibold">Sign in</h1>

      {native && (
        <p className="text-sm opacity-80">
          On iOS, Google/Apple sign-in is unavailable right now. Please use
          email/password (Google sign-in remains available on the web).
        </p>
      )}

      {!native && ENABLE_GOOGLE && (
        <button
          className="btn w-full"
          disabled={!!loading}
          onClick={() =>
            withLoad("google", async () => {
              await signInGoogle("/home");
            })
          }
        >
          Continue with Google
        </button>
      )}

      {!native && ENABLE_APPLE && (
        <button
          className="btn w-full"
          disabled={!!loading}
          onClick={() =>
            withLoad("apple", async () => {
              await signInApple("/home");
            })
          }
        >
          Continue with Apple
        </button>
      )}

      {ENABLE_EMAIL && (
        <div className="space-y-2">
          <input
            className="input w-full"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="input w-full"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            className="btn w-full"
            disabled={!!loading || !email || !password}
            onClick={() =>
              withLoad("email", async () => {
                await signInEmailPassword(email, password);
              })
            }
          >
            Sign in with Email
          </button>
        </div>
      )}

      {ENABLE_DEMO && (
        <button
          className="btn w-full"
          disabled={!!loading}
          onClick={() => {
            enableDemo();
            window.location.assign("/demo");
          }}
        >
          Browse the demo
        </button>
      )}

      {loading && <p className="text-sm opacity-70">Working: {loading}…</p>}
    </div>
  );
}
