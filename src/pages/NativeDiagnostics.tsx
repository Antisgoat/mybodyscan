import { useEffect, useMemo, useState } from "react";
import { getFunctionsOrigin, urlJoin } from "@/lib/config/functionsOrigin";

type Probe = { ok: boolean; status?: number; message?: string } | null;

export default function NativeDiagnostics() {
  const [probe, setProbe] = useState<Probe>(null);
  const { origin, source } = useMemo(() => getFunctionsOrigin(), []);
  const healthUrl = origin ? urlJoin(origin, "/health") : "(missing)";
  const lastError =
    typeof window !== "undefined" ? (window as any).__MBS_LAST_ERROR__ : null;

  useEffect(() => {
    let active = true;
    (async () => {
      if (!origin) {
        setProbe({ ok: false, message: "Missing Functions origin config" });
        return;
      }
      try {
        const response = await fetch(healthUrl, { method: "GET", cache: "no-store" });
        if (!active) return;
        setProbe({ ok: response.ok, status: response.status });
      } catch (error) {
        if (!active) return;
        setProbe({ ok: false, message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      active = false;
    };
  }, [healthUrl, origin]);

  return (
    <main className="mx-auto max-w-xl space-y-3 p-6">
      <h1 className="text-xl font-semibold">Native Diagnostics</h1>
      <div className="rounded border p-3 text-sm">
        <div><strong>Functions origin:</strong> {origin || "missing"}</div>
        <div><strong>Config source:</strong> {source}</div>
        <div><strong>/health URL:</strong> {healthUrl}</div>
      </div>
      <div className="rounded border p-3 text-sm">
        <strong>/health probe:</strong>{" "}
        {probe ? (probe.ok ? `ok (HTTP ${probe.status})` : `failed (${probe.message || `HTTP ${probe.status}`})`) : "checking..."}
      </div>
      <div className="rounded border p-3 text-sm">
        <strong>Last backend error:</strong> {String(lastError || "none")}
      </div>
    </main>
  );
}
