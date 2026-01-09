import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  getFirebaseConfig,
  getFirebaseStorage,
  storage as storageInstance,
} from "@/lib/firebase";
import { getCachedUser } from "@/auth/facade";

type Check = { name: string; ok: boolean; detail?: string };

const EXPECTED_BUCKET = "mybodyscan-f3daf.appspot.com";

export default function ScanDiagnosticsPage() {
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setBusy(true);
      const rows: Check[] = [];
      try {
        const cfg = getFirebaseConfig();
        rows.push({ name: "Firebase app", ok: Boolean(cfg?.projectId), detail: cfg?.projectId });
        rows.push({
          name: "Auth UID",
          ok: Boolean(getCachedUser()?.uid),
          detail: getCachedUser()?.uid || "missing",
        });
        const storage = getFirebaseStorage();
        rows.push({
          name: "Storage bucket",
          ok: storage?.bucket === EXPECTED_BUCKET,
          detail: storage?.bucket || "unset",
        });
        rows.push({
          name: "Functions region",
          ok: Boolean((storageInstance as any)?.app?.options?.locationId),
          detail: (storageInstance as any)?.app?.options?.locationId || "unknown",
        });
        rows.push({
          name: "Env vars",
          ok:
            Boolean(import.meta.env.VITE_FIREBASE_API_KEY) &&
            Boolean(import.meta.env.VITE_FIREBASE_PROJECT_ID),
          detail: [
            import.meta.env.VITE_FIREBASE_PROJECT_ID ? "projectId" : "missing projectId",
            import.meta.env.VITE_FIREBASE_API_KEY ? "apiKey" : "missing apiKey",
          ].join(", "),
        });
      } catch (err: any) {
        rows.push({ name: "Diagnostics error", ok: false, detail: err?.message || String(err) });
      }
      if (!cancelled) {
        setChecks(rows);
        setBusy(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold mb-4">Scan Diagnostics</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Dev-only scan readiness checks for Storage, Auth, and Functions wiring.
      </p>
      <div className="space-y-2">
        {checks.map((row) => (
          <div
            key={row.name}
            className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
          >
            <div>
              <div className="font-medium">{row.name}</div>
              {row.detail && <div className="text-muted-foreground text-xs">{row.detail}</div>}
            </div>
            <span
              className={`text-xs font-semibold ${
                row.ok ? "text-green-600" : "text-red-600"
              }`}
            >
              {row.ok ? "OK" : "Check"}
            </span>
          </div>
        ))}
        {busy && <div className="text-xs text-muted-foreground">Running checks…</div>}
      </div>
    </div>
  );
}
