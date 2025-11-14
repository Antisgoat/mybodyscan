import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { getToken as getAppCheckToken } from "firebase/app-check";
import { appCheck } from "@/lib/appCheck";
import { preferRewriteUrl } from "@/lib/api/urls";
import { apiFetchWithFallback } from "@/lib/http";
import { isDemoActive } from "@/lib/demo";

type Check = { name: string; urlKey: "systemHealth" | "coachChat" | "nutritionSearch"; method?: "GET" | "POST"; body?: any };

const TESTS: Check[] = [
  { name: "System Health", urlKey: "systemHealth", method: "GET" },
  { name: "Coach Chat", urlKey: "coachChat", method: "POST", body: { message: "hello" } },
  { name: "Nutrition", urlKey: "nutritionSearch", method: "POST", body: { q: "chicken" } },
];

export default function SystemCheckPro() {
  const user = auth.currentUser;
  const [appCheckToken, setAppCheckToken] = useState<string>("");
  const [rows, setRows] = useState<{ name: string; ok: boolean; status?: number; error?: string }[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!appCheck) return;
    getAppCheckToken(appCheck, false)
      .then((token) => setAppCheckToken(token?.token || ""))
      .catch(() => {});
  }, [appCheck]);

  async function run() {
    setRunning(true);
    const next: { name: string; ok: boolean; status?: number; error?: string }[] = [];
    for (const test of TESTS) {
      try {
        const url = preferRewriteUrl(test.urlKey);
        await apiFetchWithFallback<any>(test.urlKey, url, { method: test.method || "GET", body: test.body });
        next.push({ name: test.name, ok: true, status: 200 });
      } catch (error: any) {
        next.push({
          name: test.name,
          ok: false,
          status: typeof error?.status === "number" ? error.status : undefined,
          error: String(error?.message || error),
        });
      }
    }
    setRows(next);
    setRunning(false);
  }

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      <header className="sticky top-0 -mx-4 px-4 py-2 bg-white/80 backdrop-blur border-b flex items-center gap-2">
        <a href="/settings" className="rounded border px-2 py-1 text-xs">
          Back
        </a>
        <h1 className="text-sm font-medium">System Check Pro</h1>
        <div className="flex-1" />
        <button onClick={run} disabled={running} className="rounded border px-2 py-1 text-xs">
          {running ? "Running…" : "Run"}
        </button>
      </header>

      <section className="text-xs space-y-1">
        <div>
          User: {user?.email || "(signed out)"} · UID: {user?.uid || "-"}
        </div>
        <div>App Check token present: {appCheckToken ? "yes" : "no"}</div>
        <div>Demo Active: {String(isDemoActive())}</div>
      </section>

      <section>
        <table className="w-full text-xs border">
          <thead>
            <tr className="bg-black/5">
              <th className="p-1 text-left">Check</th>
              <th className="p-1">OK</th>
              <th className="p-1">Status</th>
              <th className="p-1">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-t">
                <td className="p-1">{row.name}</td>
                <td className="p-1">{row.ok ? "✅" : "❌"}</td>
                <td className="p-1">{row.status ?? "-"}</td>
                <td className="p-1 break-all">{row.error || ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
