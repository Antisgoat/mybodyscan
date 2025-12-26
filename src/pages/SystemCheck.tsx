import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/http";
import { useAuthUser } from "@/lib/useAuthUser";
import { BUILD } from "@/lib/build";
import { useAppCheckStatus } from "@/hooks/useAppCheckStatus";
import { db, getFirebaseStorage, getFirebaseConfig } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable } from "firebase/storage";
import {
  cameraReadyOnThisDevice,
  hasGetUserMedia,
  isSecureContextOrLocal,
  isNativeCapacitor,
} from "@/lib/platform";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { Badge } from "@/components/ui/badge";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";
import { getScanPhotoPath } from "@/lib/uploads/storagePaths";
import { SCAN_UPLOAD_CONTENT_TYPE } from "@/lib/uploads/uploadViaStorage";

type Health = Record<string, any> | null;
type CheckRow = { name: string; ok: boolean; detail?: string };

export default function SystemCheckPage() {
  const { user, loading } = useAuthUser();
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [checksBusy, setChecksBusy] = useState(false);
  const { health: systemHealth } = useSystemHealth();
  const appCheck = useAppCheckStatus();
  const { statuses: featureStatuses } = computeFeatureStatuses(
    systemHealth ?? undefined
  );

  async function runChecks() {
    setBusy(true);
    setError(null);
    setHealth(null);
    try {
      const data = await apiFetch<Record<string, any>>("/api/system/health", {
        method: "GET",
      });
      setHealth(data || {});
    } catch (e: any) {
      setError(e?.message || "Health check failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!loading) void runChecks();
  }, [loading]);

  async function runFirebaseChecks() {
    setChecksBusy(true);
    const next: CheckRow[] = [];
    try {
      if (!user?.uid) {
        next.push({
          name: "Auth",
          ok: false,
          detail: "Signed out",
        });
        setChecks(next);
        return;
      }
      next.push({ name: "Auth", ok: true, detail: `uid=${user.uid}` });
      next.push({
        name: "App Check",
        ok: appCheck.status === "ready" || appCheck.status === "disabled",
        detail: `${appCheck.status} · tokenPresent=${appCheck.tokenPresent ? "true" : "false"}`,
      });

      // Firestore read/write: use an allowed subcollection under users/{uid}/settings/*
      try {
        const refDoc = doc(db, "users", user.uid, "settings", "systemCheck");
        await setDoc(
          refDoc,
          { lastRunAt: serverTimestamp(), platform: "web" },
          { merge: true }
        );
        const snap = await getDoc(refDoc);
        next.push({
          name: "Firestore read/write",
          ok: snap.exists(),
          detail: snap.exists() ? "ok" : "missing after write",
        });
      } catch (err: any) {
        next.push({
          name: "Firestore read/write",
          ok: false,
          detail: `${err?.code ?? "error"} · ${err?.message ?? String(err)}`,
        });
      }

      // Storage write/read: small blob under user_uploads/{uid}/debug/*
      try {
        const storage = getFirebaseStorage();
        const bytes = new Uint8Array(1024);
        bytes.fill(0x7a); // 'z'
        const blob = new Blob([bytes], { type: "text/plain" });
        const path = `user_uploads/${user.uid}/debug/system-check-${Date.now()}.txt`;
        const r = ref(storage, path);
        const result = await uploadBytes(r, blob, { contentType: "text/plain" });
        const url = await getDownloadURL(result.ref);
        next.push({
          name: "Storage write/read",
          ok: Boolean(url),
          detail: `ok · ${path}`,
        });
      } catch (err: any) {
        next.push({
          name: "Storage write/read",
          ok: false,
          detail: `${err?.code ?? "error"} · ${err?.message ?? String(err)}`,
        });
      }

      // Resumable upload using the Storage Web SDK (canonical scan path).
      try {
        const storage = getFirebaseStorage();
        const blob = new Blob([new Uint8Array([1, 2, 3, 4])], {
          type: "image/jpeg",
        });
        const scanId = `health-${Date.now()}`;
        const path = getScanPhotoPath(user.uid, scanId, "front");
        await new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(ref(storage, path), blob, {
            contentType: SCAN_UPLOAD_CONTENT_TYPE,
          });
          task.on("state_changed", undefined, reject, () => resolve());
        });
        next.push({
          name: "Storage upload (SDK resumable)",
          ok: true,
          detail: `ok · ${path}`,
        });
      } catch (err: any) {
        next.push({
          name: "Storage upload (SDK resumable)",
          ok: false,
          detail: `${err?.code ?? "error"} · ${err?.message ?? String(err)}`,
        });
      }

      // Functions health is already covered via /api/system/health above, but show a fast probe too.
      try {
        const data = await apiFetch<Record<string, any>>("/api/system/health", {
          method: "GET",
        });
        next.push({
          name: "Functions health",
          ok: Boolean(data),
          detail: "ok",
        });
      } catch (err: any) {
        next.push({
          name: "Functions health",
          ok: false,
          detail: `${err?.status ?? ""} ${err?.message ?? String(err)}`.trim(),
        });
      }
    } finally {
      setChecks(next);
      setChecksBusy(false);
    }
  }

  const envRows = [
    ["User", user ? user.uid : "(signed out)"],
    ["Capacitor Native", String(isNativeCapacitor())],
    ["Secure Context / Localhost", String(isSecureContextOrLocal())],
    ["getUserMedia()", String(hasGetUserMedia())],
    ["Camera Ready", String(cameraReadyOnThisDevice())],
    ["Build Time", BUILD.time || "(unset)"],
    ["Build SHA", BUILD.sha || "(unset)"],
    ["Mode", BUILD.mode],
    [
      "Google Sign-In Enabled",
      String(
        (import.meta.env.VITE_ENABLE_GOOGLE ?? "true")
          .toString()
          .toLowerCase() !== "false"
      ),
    ],
    [
      "Apple Sign-In Enabled",
      String(
        (import.meta.env.VITE_ENABLE_APPLE ?? "true")
          .toString()
          .toLowerCase() !== "false"
      ),
    ],
    [
      "Storage bucket (client)",
      String(getFirebaseConfig()?.storageBucket || getFirebaseStorage().app.options?.storageBucket || "(unset)"),
    ],
    [
      "Storage bucket (server)",
      systemHealth?.storageBucket
        ? `${systemHealth.storageBucket}${systemHealth.storageBucketSource ? ` (${systemHealth.storageBucketSource})` : ""}`
        : "unknown",
    ],
    [
      "Scan engine configured",
      systemHealth?.scanEngineConfigured === false
        ? "false"
        : systemHealth?.scanEngineConfigured
          ? "true"
          : "unknown",
    ],
    [
      "Missing (engine)",
      Array.isArray(systemHealth?.scanEngineMissing) && systemHealth?.scanEngineMissing.length
        ? systemHealth.scanEngineMissing.join(", ")
        : "—",
    ],
  ];

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4" data-testid="system-check-root">
      <header className="sticky top-0 z-40 -mx-4 mb-1 bg-white/80 backdrop-blur border-b px-4 py-2 flex items-center gap-3">
        <a href="/settings" className="rounded border px-2 py-1 text-xs">
          Back
        </a>
        <h1 className="text-sm font-medium">System Check</h1>
        <div className="flex-1" />
        <button
          onClick={runChecks}
          disabled={busy}
          className="rounded border px-2 py-1 text-xs"
        >
          {busy ? "Running…" : "Re-run"}
        </button>
      </header>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Environment</h2>
        <table className="w-full text-xs">
          <tbody>
            {envRows.map(([k, v]) => (
              <tr key={k} className="border-b last:border-0">
                <td className="py-1 pr-2 text-muted-foreground whitespace-nowrap">
                  {k}
                </td>
                <td className="py-1 break-all">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Feature availability</h2>
        <div className="space-y-2 text-sm">
          {featureStatuses.map((status) => (
            <div
              key={status.id}
              className="flex items-start justify-between gap-3 rounded border px-3 py-2"
            >
              <div className="flex-1">
                <span className="font-medium">{status.label}</span>
                {status.detail && (
                  <p className="text-xs text-muted-foreground">
                    {status.detail}
                  </p>
                )}
              </div>
              <Badge variant={status.configured ? "default" : "secondary"}>
                {status.configured ? status.okLabel : status.warnLabel}
              </Badge>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Firebase checks</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void runFirebaseChecks()}
            disabled={checksBusy}
            className="rounded border px-2 py-1 text-xs"
          >
            {checksBusy ? "Running…" : "Run Firebase checks"}
          </button>
          <span className="text-[11px] text-muted-foreground">
            Storage check writes to <code>user_uploads/&lt;uid&gt;/debug/</code>.
          </span>
        </div>
        <table className="w-full text-xs border">
          <thead>
            <tr className="bg-black/5">
              <th className="p-1 text-left">Check</th>
              <th className="p-1">OK</th>
              <th className="p-1 text-left">Detail</th>
            </tr>
          </thead>
          <tbody>
            {checks.length === 0 ? (
              <tr className="border-t">
                <td className="p-2 text-muted-foreground" colSpan={3}>
                  Run the checks to validate auth, Firestore, Storage, and functions.
                </td>
              </tr>
            ) : (
              checks.map((row) => (
                <tr key={row.name} className="border-t">
                  <td className="p-1">{row.name}</td>
                  <td className="p-1 text-center">{row.ok ? "OK" : "FAIL"}</td>
                  <td className="p-1 break-all text-muted-foreground">
                    {row.detail ?? ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">/api/system/health</h2>
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
        {!error && !health && (
          <p className="text-xs text-muted-foreground">
            Waiting for health response…
          </p>
        )}
        {health && (
          <pre className="rounded border bg-black/5 p-2 text-[11px] overflow-auto">
            {JSON.stringify(health, null, 2)}
          </pre>
        )}
        <p className="text-[11px] text-muted-foreground">
          This request includes your Firebase ID token and App Check token (if
          available). We expect JSON and no “app_check_required” errors during
          UAT (soft mode).
        </p>
      </section>

      <section className="space-y-1">
        <h2 className="text-sm font-medium">Camera Readiness</h2>
        <p className="text-xs text-muted-foreground">
          For barcode scanning and camera previews, we require a secure context
          on web. In the native wrapper, file inputs will open Camera/Library.
        </p>
      </section>
    </div>
  );
}
