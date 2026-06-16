import { useEffect, useMemo, useState } from "react";
import { useAuthUser, getIdToken } from "@/auth/mbs-auth";
import { useClaims } from "@/lib/claims";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { nutritionSearch } from "@/lib/api/nutrition";
import { getDailyLog } from "@/lib/nutritionBackend";
import { getPlan, getWorkouts } from "@/lib/workouts";
import { validateScanUploadInputs } from "@/lib/api/scan";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Result = {
  name: string;
  ok: boolean;
  latencyMs: number;
  error: string;
  detail?: string;
};

const todayISO = new Date().toISOString().slice(0, 10);


const redactScanForQa = (scan: any) => {
  if (!scan || typeof scan !== "object") return scan;
  const {
    photoPaths: _photoPaths,
    errorInfo: _errorInfo,
    raw: _raw,
    backendError: _backendError,
    ...rest
  } = scan;
  return {
    ...rest,
    photoPathCount:
      scan.photoPaths && typeof scan.photoPaths === "object"
        ? Object.keys(scan.photoPaths).length
        : 0,
    hasBackendError: Boolean(scan.errorInfo || scan.backendError),
  };
};

const normalizeError = (error: unknown): string => {
  if (!error) return "unknown_error";
  const e = error as any;
  return String(e?.message || e?.code || e?.status || JSON.stringify(e));
};

export default function LiveFlowsQA() {
  const { user } = useAuthUser();
  const { claims } = useClaims();
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);
  const [latestScan, setLatestScan] = useState<any>(null);

  const allowed = useMemo(() => {
    const c = (claims || {}) as any;
    return Boolean(
      c.admin || c.dev || c.staff || c.unlimited || c.unlimitedCredits
    );
  }, [claims]);

  useEffect(() => {
    if (!user || !allowed) return;
    let cancelled = false;
    async function loadLatestScan() {
      const snap = await getDocs(
        query(
          collection(db, "users", user!.uid, "scans"),
          orderBy("createdAt", "desc"),
          limit(1)
        )
      ).catch(() => null);
      if (cancelled || !snap || snap.empty) return;
      const docSnap = snap.docs[0];
      setLatestScan({ id: docSnap.id, ...docSnap.data() });
    }
    void loadLatestScan();
    return () => {
      cancelled = true;
    };
  }, [allowed, user]);

  async function run(name: string, fn: () => Promise<string | void>) {
    const started = performance.now();
    try {
      const detail = await fn();
      const latencyMs = Math.round(performance.now() - started);
      setResults((prev) => [
        ...prev,
        { name, ok: true, latencyMs, error: "", detail },
      ]);
    } catch (error) {
      const latencyMs = Math.round(performance.now() - started);
      setResults((prev) => [
        ...prev,
        { name, ok: false, latencyMs, error: normalizeError(error) },
      ]);
    }
  }

  async function runAll() {
    if (!user) return;
    setRunning(true);
    setResults([]);

    let latestScanId: string | null = latestScan?.id ?? null;

    try {
      await run("1. auth state", async () => {
        const token = await getIdToken({ forceRefresh: false });
        if (!token) throw new Error("missing_auth_token");
        return `uid=${user.uid}`;
      });
      await run("2. profile/onboarding read", async () => {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) throw new Error("user_doc_missing");
        const d = snap.data() as any;
        return `onboarding=${String(Boolean(d?.onboardingCompleted || d?.onboarding?.completed))}`;
      });
      await run("3. entitlement/subscription/credits read", async () => {
        const [creditsSnap, entSnap] = await Promise.all([
          getDoc(doc(db, "users", user.uid, "private", "credits")),
          getDoc(doc(db, "users", user.uid, "entitlements", "pro")),
        ]);
        return `credits=${creditsSnap.data()?.creditsSummary?.totalAvailable ?? "na"}, pro=${Boolean(entSnap.data()?.pro)}`;
      });
      await run("4. coachChat manual verification", async () => {
        return "manual only: skipped to avoid paid AI request or message writes";
      });
      await run("5. nutritionSearch read", async () => {
        const res = await nutritionSearch("banana");
        return `items=${res.results.length}, source=${res.source || "unknown"}`;
      });
      await run("6. getDailyLog read", async () => {
        const res = await getDailyLog(todayISO);
        return `meals=${Array.isArray((res as any)?.meals) ? (res as any).meals.length : 0}`;
      });
      await run("7. getPlan read", async () => {
        const res = await getPlan();
        return `planId=${String((res as any)?.planId || (res as any)?.id || "none")}`;
      });
      await run("8. getWorkouts read", async () => {
        const res = await getWorkouts();
        return `days=${res?.days?.length ?? 0}`;
      });
      await run("9. latest scan/result diagnostics read", async () => {
        const snap = await getDocs(
          query(
            collection(db, "users", user.uid, "scans"),
            orderBy("createdAt", "desc"),
            limit(1)
          )
        );
        if (snap.empty) {
          setLatestScan(null);
          return "no scan documents found";
        }
        const docSnap = snap.docs[0];
        const next = { id: docSnap.id, ...docSnap.data() };
        latestScanId = docSnap.id;
        setLatestScan(next);
        return `scanId=${docSnap.id}, status=${String((next as any).status ?? "unknown")}`;
      });
      await run("10. scan upload validation only", async () => {
        const pixel = new File([new Uint8Array([137, 80, 78, 71])], "qa.png", {
          type: "image/png",
        });
        const probe = validateScanUploadInputs({
          uid: user.uid,
          photos: {
            front: pixel,
            back: pixel,
            left: pixel,
            right: pixel,
          } as any,
        });
        if (!probe.ok) throw new Error(probe.error.message);
        return `client-only targets=${probe.data.uploadTargets.length}, bytes=${probe.data.totalBytes}`;
      });
      await run("11. Transformation Preview read access", async () => {
        if (!latestScanId) return "skipped: no latest scan";
        const ref = doc(
          db,
          "users",
          user.uid,
          "transformationPreviews",
          latestScanId
        );
        const snap = await getDoc(ref);
        return `doc=${ref.path}, exists=${String(snap.exists())}`;
      });
    } finally {
      setRunning(false);
    }
  }

  if (!user) return <div className="p-6">Sign in required.</div>;
  if (!allowed)
    return (
      <div className="p-6">
        Internal QA access only (admin/dev/unlimited/staff).
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Live Flow Diagnostics QA</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={runAll} disabled={running}>
            {running ? "Running…" : "Run read-only live-flow checks"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            Read-only by default: no meals, workout plans, scan sessions,
            credits, or paid AI calls are created by this check.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Latest scan/result diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {latestScan ? (
            <>
              <div className="grid gap-2 md:grid-cols-2">
                <div>scanId: {latestScan.id}</div>
                <div>scan status: {String(latestScan.status ?? "unknown")}</div>
                <div>
                  AI processing status:{" "}
                  {String(
                    latestScan.aiProcessing?.status ??
                      latestScan.lastStep ??
                      "unknown"
                  )}
                </div>
                <div>
                  provider:{" "}
                  {String(latestScan.aiProcessing?.provider ?? "unknown")}
                </div>
                <div>
                  output source:{" "}
                  {latestScan.usedFallback
                    ? "fallback"
                    : String(
                        latestScan.resultSource ??
                          (latestScan.status === "complete"
                            ? "real/legacy"
                            : "none")
                      )}
                </div>
                <div>
                  timeout/error code:{" "}
                  {String(
                    latestScan.errorReason ??
                      latestScan.aiProcessing?.errorCode ??
                      "none"
                  )}
                </div>
                <div>
                  credit status:{" "}
                  {latestScan.refundedAt
                    ? "refunded"
                    : latestScan.charged
                      ? "consumed/charged"
                      : String(latestScan.creditStatus ?? "not charged")}
                </div>
                <div>
                  completedAt:{" "}
                  {String(
                    latestScan.completedAt?.toDate?.()?.toISOString?.() ??
                      latestScan.completedAt ??
                      "none"
                  )}
                </div>
              </div>
              <details className="rounded-lg border p-3">
                <summary className="cursor-pointer font-medium">
                  Result document fields returned
                </summary>
                <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(
                    redactScanForQa(latestScan),
                    (_key, value) => {
                      if (value && typeof value.toDate === "function")
                        return value.toDate().toISOString();
                      return value;
                    },
                    2
                  )}
                </pre>
              </details>
            </>
          ) : (
            <div>No scan document found yet.</div>
          )}
        </CardContent>
      </Card>

      {results.map((r) => (
        <Card key={r.name}>
          <CardContent className="pt-4">
            <div className="font-medium">{r.name}</div>
            <div>status: {r.ok ? "PASS" : "FAIL"}</div>
            <div>latency: {r.latencyMs}ms</div>
            <div>error: {r.error || ""}</div>
            {r.detail ? <div>detail: {r.detail}</div> : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
