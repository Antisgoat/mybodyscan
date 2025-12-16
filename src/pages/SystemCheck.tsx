import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/http";
import { useAuthUser } from "@/lib/useAuthUser";
import { BUILD } from "@/lib/build";
import {
  cameraReadyOnThisDevice,
  hasGetUserMedia,
  isSecureContextOrLocal,
  isNativeCapacitor,
} from "@/lib/platform";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { Badge } from "@/components/ui/badge";
import { useSystemHealth } from "@/hooks/useSystemHealth";

type Health = Record<string, any> | null;

export default function SystemCheckPage() {
  const { user, loading } = useAuthUser();
  const [health, setHealth] = useState<Health>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { health: systemHealth } = useSystemHealth();
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
