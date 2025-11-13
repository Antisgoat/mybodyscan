import { useEffect, useState } from "react";
import { useAuthUser } from "@/lib/useAuthUser";
import { auth, appCheck } from "@/lib/firebase";
import {
  getIdToken,
  EmailAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  GoogleAuthProvider,
  signOut,
  type User,
} from "firebase/auth";
import { getToken as getAppCheckToken } from "firebase/app-check";
import { useNavigate } from "react-router-dom";

export default function SettingsAccountPrivacyPage() {
  const { user, loading } = useAuthUser();
  const nav = useNavigate();

  const [provider, setProvider] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav("/auth?next=/settings/account");
    if (user) setProvider(user.providerData[0]?.providerId || null);
  }, [user, loading, nav]);

  async function ensureRecentLogin(currentUser: User) {
    const p = provider || "";
    if (p.includes("password")) {
      if (!password) throw new Error("Please enter your password");
      const cred = EmailAuthProvider.credential(currentUser.email || "", password);
      await reauthenticateWithCredential(currentUser, cred);
    } else if (p.includes("google")) {
      await reauthenticateWithPopup(currentUser, new GoogleAuthProvider());
    }
  }

  async function onDelete() {
    setErr(null);
    setMsg(null);
    if (!user) return;
    if (confirm.trim().toUpperCase() !== "DELETE") {
      setErr("Type DELETE to confirm");
      return;
    }
    setBusy(true);
    try {
      await ensureRecentLogin(user);

      const idToken = await getIdToken(user, true);
      const ac = appCheck ? await getAppCheckToken(appCheck, false).catch(() => null) : null;

      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
          ...(ac?.token ? { "X-Firebase-AppCheck": ac.token } : {}),
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (j?.error === "reauth_required") {
          throw new Error("Please re-authenticate and try again.");
        }
        throw new Error(j?.error || `HTTP ${res.status}`);
      }

      setMsg("Account deleted.");
      await signOut(auth);
      nav("/auth");
    } catch (e: any) {
      setErr(e?.message || "Could not delete account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      <header className="sticky top-0 z-40 -mx-4 mb-1 bg-white/80 backdrop-blur border-b px-4 py-2 flex items-center gap-3">
        <a href="/settings" className="rounded border px-2 py-1 text-xs">Back</a>
        <h1 className="text-sm font-medium">Account &amp; Privacy</h1>
        <div className="flex-1" />
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Legal</h2>
        <div className="flex flex-col gap-2 text-sm">
          <a className="underline" href="/legal/privacy">Privacy Policy</a>
          <a className="underline" href="/legal/terms">Terms of Service</a>
          <a className="underline" href="/legal/refund">Refund Policy</a>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Delete my account</h2>
        <p className="text-xs text-muted-foreground">
          Deleting your account will permanently remove your scans, notes, and settings. This cannot be undone.
        </p>

        {provider?.includes("password") && (
          <label className="text-xs block">
            Password (required to confirm)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border px-2 py-1 text-sm"
              autoComplete="current-password"
            />
          </label>
        )}

        <label className="text-xs block">
          Type <span className="font-mono">DELETE</span> to confirm
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            placeholder="DELETE"
          />
        </label>

        {err && (
          <p role="alert" className="text-xs text-red-700">
            {err}
          </p>
        )}
        {msg && (
          <p role="status" className="text-xs text-emerald-700">
            {msg}
          </p>
        )}

        <button
          onClick={onDelete}
          disabled={busy}
          className="rounded border px-3 py-2 text-sm bg-red-50 border-red-200 text-red-800"
        >
          {busy ? "Deleting…" : "Delete my account"}
        </button>
      </section>
    </div>
  );
}
