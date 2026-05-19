import { useMemo, useState } from "react";
import { useAuthUser, getIdToken } from "@/auth/mbs-auth";
import { useClaims } from "@/lib/claims";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { coachChatApi } from "@/lib/api/coach";
import { nutritionSearch } from "@/lib/api/nutrition";
import { addMeal, deleteMeal, getDailyLog } from "@/lib/nutritionBackend";
import { getPlan, getWorkouts, applyCatalogPlan } from "@/lib/workouts";
import { startScanSessionClient, validateScanUploadInputs } from "@/lib/api/scan";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Result = { name: string; ok: boolean; latencyMs: number; error: string; detail?: string };

const todayISO = new Date().toISOString().slice(0, 10);

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

  const allowed = useMemo(() => {
    const c = (claims || {}) as any;
    return Boolean(c.admin || c.dev || c.staff || c.unlimited || c.unlimitedCredits);
  }, [claims]);

  async function run(name: string, fn: () => Promise<string | void>) {
    const started = performance.now();
    try {
      const detail = await fn();
      const latencyMs = Math.round(performance.now() - started);
      setResults((prev) => [...prev, { name, ok: true, latencyMs, error: "", detail }]);
    } catch (error) {
      const latencyMs = Math.round(performance.now() - started);
      setResults((prev) => [...prev, { name, ok: false, latencyMs, error: normalizeError(error) }]);
    }
  }

  async function runAll() {
    if (!user) return;
    setRunning(true);
    setResults([]);
    let testMealId: string | null = null;
    let scanId: string | null = null;

    await run("1. auth state", async () => {
      const token = await getIdToken({ forceRefresh: false });
      if (!token) throw new Error("missing_auth_token");
      return `uid=${user.uid}`;
    });
    await run("2. profile/onboarding", async () => {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) throw new Error("user_doc_missing");
      const d = snap.data() as any;
      return `onboarding=${String(Boolean(d?.onboardingCompleted || d?.onboarding?.completed))}`;
    });
    await run("3. entitlement/subscription/credits", async () => {
      const [creditsSnap, entSnap] = await Promise.all([
        getDoc(doc(db, "users", user.uid, "private", "credits")),
        getDoc(doc(db, "users", user.uid, "entitlements", "pro")),
      ]);
      return `credits=${creditsSnap.data()?.creditsSummary?.totalAvailable ?? "na"}, pro=${Boolean(entSnap.data()?.pro)}`;
    });
    await run("4. coachChat callable", async () => {
      const res = await coachChatApi({ message: "QA ping: respond with one short line." });
      if (!res.replyText) throw new Error("empty_coach_reply");
      return res.replyText.slice(0, 60);
    });
    await run("5. nutritionSearch callable", async () => {
      const res = await nutritionSearch("banana");
      return `items=${res.results.length}, source=${res.source || "unknown"}`;
    });
    await run("6. getDailyLog callable/http", async () => {
      const res = await getDailyLog(todayISO);
      return `meals=${Array.isArray((res as any)?.meals) ? (res as any).meals.length : 0}`;
    });
    await run("7. addMeal callable", async () => {
      const meal = {
        name: "QA Test Item (safe)", mealType: "snacks", calories: 10, protein: 0, carbs: 1, fat: 0, notes: "qa-live-flows",
      };
      const res = await addMeal(todayISO, meal);
      testMealId = (res as any)?.meal?.id || null;
      if (!testMealId) throw new Error("add_meal_missing_id");
      return `mealId=${testMealId}`;
    });
    await run("8. deleteMeal callable", async () => {
      if (!testMealId) throw new Error("skipped_no_test_meal");
      await deleteMeal(todayISO, testMealId);
    });
    await run("9. getPlan callable", async () => {
      const res = await getPlan();
      return `planId=${String((res as any)?.planId || (res as any)?.id || "none")}`;
    });
    await run("10. getWorkouts callable", async () => {
      const res = await getWorkouts();
      return `days=${res?.days?.length ?? 0}`;
    });
    await run("11. applyCatalogPlan safe path", async () => {
      const payload = {
        programId: "qa-live-flow",
        title: "QA Safe Plan",
        goal: "recomp",
        level: "beginner",
        days: [{ day: "Mon", exercises: [{ name: "Bodyweight Squat", sets: 2, reps: "8" }] }],
      };
      const res = await applyCatalogPlan(payload as any);
      return `ok=${String(Boolean((res as any)?.ok ?? true))}`;
    });
    await run("12. startScanSession callable/http", async () => {
      const res = await startScanSessionClient({ currentWeightKg: 70, goalWeightKg: 69, heightCm: 175, correlationId: `qa-${Date.now()}` });
      if (!res.ok) throw new Error(res.error.message || "start_scan_failed");
      scanId = res.data.scanId;
      return `scanId=${scanId}`;
    });
    await run("13. scan upload readiness (no credit consume)", async () => {
      if (!scanId) throw new Error("skipped_no_scan_session");
      const f = new File(["qa"], "qa.txt", { type: "text/plain" });
      const probe = validateScanUploadInputs({ uid: user.uid, photos: { front: f, back: f, left: f, right: f } as any });
      if (!probe.ok) throw new Error(probe.error.message);
      return `targets=${probe.data.uploadTargets.length}`;
    });
    await run("14. Transformation Preview readiness", async () => {
      if (!scanId) throw new Error("missing_scanId");
      const ref = doc(db, "users", user.uid, "transformationPreviews", scanId);
      return `doc=${ref.path}`;
    });

    setRunning(false);
  }

  if (!user) return <div className="p-6">Sign in required.</div>;
  if (!allowed) return <div className="p-6">Internal QA access only (admin/dev/unlimited/staff).</div>;

  return (
    <div className="mx-auto max-w-5xl p-6 space-y-4">
      <Card>
        <CardHeader><CardTitle>Live Flow Diagnostics QA</CardTitle></CardHeader>
        <CardContent>
          <Button onClick={runAll} disabled={running}>{running ? "Running…" : "Run all live-flow checks"}</Button>
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
