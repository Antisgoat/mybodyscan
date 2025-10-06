import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { useDemoMode } from "@/components/DemoModeProvider";
import { fetchFoods } from "@/lib/api";
import type { FoodItem } from "@/lib/nutrition/types";
import { FUNCTIONS_BASE } from "@/lib/env";
import { auth, db, firebaseConfig } from "@/lib/firebase";

type HealthResponse = {
  status: "ok";
  time: string;
  hasOpenAIKey: boolean;
  appCheckSoft: boolean;
  scanProvider: "openai-vision" | "mock";
  nutritionConfigured: boolean;
  coachDocPath: "users/{uid}/coach/plan";
  demoCreditsPolicy: ">=2 on demo";
};

type NutritionState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; items: FoodItem[]; stub: boolean }
  | { status: "error"; error: string };

type PlanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: Record<string, unknown> | null; message: string }
  | { status: "error"; error: string };

type CreditsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; value: number | null; data: Record<string, unknown> | null; message: string; note?: string }
  | { status: "error"; error: string };

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch (_) {
    return "Unknown error";
  }
}

function buildHealthUrl(): string {
  if (FUNCTIONS_BASE) {
    return `${FUNCTIONS_BASE}/health`;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      const projectId = firebaseConfig?.projectId;
      if (projectId) {
        return `http://127.0.0.1:5001/${projectId}/us-central1/health`;
      }
    }
  }
  return "";
}

function CheckRow({ label, ok, detail }: { label: string; ok: boolean; detail?: ReactNode }) {
  const Icon = ok ? CheckCircle2 : XCircle;
  const iconClass = ok ? "text-emerald-500" : "text-red-500";
  return (
    <div className="flex items-start gap-3 rounded-md border border-border bg-background/50 p-3">
      <Icon className={`mt-0.5 h-5 w-5 ${iconClass}`} />
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
}

const SystemCheck = () => {
  const demo = useDemoMode();
  const [healthData, setHealthData] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthUrl, setHealthUrl] = useState<string>("");

  const [nutritionState, setNutritionState] = useState<NutritionState>({ status: "idle" });
  const [planState, setPlanState] = useState<PlanState>({ status: "idle" });
  const [creditsState, setCreditsState] = useState<CreditsState>({ status: "idle" });

  useEffect(() => {
    let active = true;
    const url = buildHealthUrl();
    setHealthUrl(url);
    if (!url) {
      setHealthError("Configure VITE_FUNCTIONS_BASE_URL or start the Firebase Functions emulator to call /health.");
      setHealthLoading(false);
      return () => {
        active = false;
      };
    }

    (async () => {
      setHealthLoading(true);
      try {
        const response = await fetch(url, {
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          throw new Error(`health_status_${response.status}`);
        }
        const data = (await response.json()) as HealthResponse;
        if (active) {
          setHealthData(data);
          setHealthError(null);
        }
      } catch (error) {
        if (active) {
          setHealthError(formatError(error));
          setHealthData(null);
        }
      } finally {
        if (active) {
          setHealthLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const healthChecks = useMemo(() => {
    if (!healthData) {
      return [];
    }
    return [
      {
        label: "OpenAI API key",
        ok: healthData.hasOpenAIKey,
        detail: healthData.hasOpenAIKey ? "Vision scans run live" : "Missing key - scan falls back to mock mode.",
      },
      {
        label: "Nutrition API key",
        ok: healthData.nutritionConfigured,
        detail: healthData.nutritionConfigured
          ? "USDA search available"
          : "No USDA key detected - nutrition search will use stub list.",
      },
      {
        label: "Scan provider",
        ok: healthData.scanProvider === "openai-vision",
        detail:
          healthData.scanProvider === "openai-vision"
            ? "Scan requests use OpenAI Vision"
            : "Currently in mock scan mode.",
      },
      {
        label: "App Check enforcement",
        ok: healthData.appCheckSoft,
        detail: healthData.appCheckSoft
          ? "Soft mode (missing tokens log but do not block)"
          : "Strict App Check enabled for allowed origins.",
      },
      {
        label: "Demo credits policy",
        ok: healthData.demoCreditsPolicy === ">=2 on demo",
        detail: `Expected: ${healthData.demoCreditsPolicy}`,
      },
    ];
  }, [healthData]);

  async function handleNutritionTest() {
    setNutritionState({ status: "loading" });
    try {
      const items = await fetchFoods("chicken");
      const top = items.slice(0, 3);
      const stub = top.length > 0 && top.every((item) => Boolean((item.raw as any)?.stub));
      setNutritionState({ status: "success", items: top, stub });
    } catch (error) {
      setNutritionState({ status: "error", error: formatError(error) });
    }
  }

  async function handlePlanRead() {
    const user = auth.currentUser;
    if (!user) {
      setPlanState({ status: "success", data: null, message: "Sign in to read the coach plan document." });
      return;
    }
    setPlanState({ status: "loading" });
    try {
      const planRef = doc(db, "users", user.uid, "coach", "plan");
      const snap = await getDoc(planRef);
      if (!snap.exists()) {
        setPlanState({ status: "success", data: null, message: "No coach plan document found." });
        return;
      }
      setPlanState({ status: "success", data: snap.data() as Record<string, unknown>, message: "Coach plan loaded." });
    } catch (error) {
      setPlanState({ status: "error", error: formatError(error) });
    }
  }

  async function handleCreditsRead() {
    const user = auth.currentUser;
    if (!user) {
      setCreditsState({
        status: "success",
        value: null,
        data: null,
        message: "Sign in to read profile credits.",
        note: demo ? "Demo mode will seed credits on first login." : undefined,
      });
      return;
    }
    setCreditsState({ status: "loading" });
    try {
      const profileRef = doc(db, "users", user.uid, "profile");
      const snap = await getDoc(profileRef);
      if (!snap.exists()) {
        setCreditsState({
          status: "success",
          value: null,
          data: null,
          message: "Profile document not found.",
          note: demo ? "Demo profile will seed credits on first login." : undefined,
        });
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const raw = data?.credits;
      const hasNumber = typeof raw === "number" && Number.isFinite(raw);
      const value = hasNumber ? (raw as number) : null;
      let note: string | undefined;
      if (!hasNumber) {
        note = demo ? "Demo profile will seed credits on first login." : "Credits field missing.";
      }
      setCreditsState({ status: "success", value, data, message: "Profile loaded.", note });
    } catch (error) {
      setCreditsState({ status: "error", error: formatError(error) });
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">System Check</h1>
        <p className="text-sm text-muted-foreground">
          Ping the /health Cloud Function and run quick nutrition, coach, and credits reads after deploy.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium">Cloud Functions health</h2>
            <p className="text-sm text-muted-foreground">
              Checking <span className="font-mono text-xs">{healthUrl || "(missing URL)"}</span>
            </p>
          </div>
          {healthLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : null}
        </div>

        {healthError ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {healthError}
          </div>
        ) : null}

        {healthChecks.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {healthChecks.map((check) => (
              <CheckRow key={check.label} label={check.label} ok={check.ok} detail={check.detail} />
            ))}
          </div>
        ) : null}

        {healthData ? (
          <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs text-muted-foreground">
            {JSON.stringify(healthData, null, 2)}
          </pre>
        ) : null}
      </section>

      <section className="space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm">
        <h2 className="text-lg font-medium">Manual smoke tests</h2>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-medium">Nutrition search ("chicken")</h3>
              <p className="text-sm text-muted-foreground">Calls /api/nutrition/search (rewritten to nutritionSearch).</p>
            </div>
            <Button onClick={handleNutritionTest} disabled={nutritionState.status === "loading"}>
              {nutritionState.status === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Searching
                </>
              ) : (
                "Run search"
              )}
            </Button>
          </div>

          {nutritionState.status === "error" ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{nutritionState.error}</p>
          ) : null}

          {nutritionState.status === "success" ? (
            <div className="rounded-md border border-border bg-background/60 p-4 text-sm">
              <p className="font-medium">
                {nutritionState.stub ? "Stub mode results" : "Top results"}
              </p>
              <ul className="mt-2 space-y-2">
                {nutritionState.items.map((item) => (
                  <li key={item.id} className="rounded border border-dashed border-border/60 p-2">
                    <div className="text-sm font-semibold">{item.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[item.brand, item.source].filter(Boolean).join(" • ")}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {typeof item.per_serving.kcal === "number" && Number.isFinite(item.per_serving.kcal)
                        ? `${item.per_serving.kcal} kcal`
                        : "kcal n/a"}
                      {" · "}
                      {typeof item.per_serving.protein_g === "number" && Number.isFinite(item.per_serving.protein_g)
                        ? `${item.per_serving.protein_g}g protein`
                        : "protein n/a"}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-medium">Coach plan document</h3>
              <p className="text-sm text-muted-foreground">Reads users/{{uid}}/coach/plan.</p>
            </div>
            <Button onClick={handlePlanRead} disabled={planState.status === "loading"}>
              {planState.status === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading
                </>
              ) : (
                "Fetch plan"
              )}
            </Button>
          </div>

          {planState.status === "error" ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{planState.error}</p>
          ) : null}

          {planState.status === "success" ? (
            <div className="space-y-2 rounded-md border border-border bg-background/60 p-4 text-sm">
              <p className="font-medium">{planState.message}</p>
              {planState.data ? (
                <pre className="overflow-x-auto rounded bg-muted p-3 text-xs text-muted-foreground">
                  {JSON.stringify(planState.data, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-muted-foreground">No data to display.</p>
              )}
            </div>
          ) : null}
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-medium">Profile credits</h3>
              <p className="text-sm text-muted-foreground">Reads users/{{uid}}/profile.credits.</p>
            </div>
            <Button onClick={handleCreditsRead} disabled={creditsState.status === "loading"}>
              {creditsState.status === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading
                </>
              ) : (
                "Fetch credits"
              )}
            </Button>
          </div>

          {creditsState.status === "error" ? (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{creditsState.error}</p>
          ) : null}

          {creditsState.status === "success" ? (
            <div className="space-y-2 rounded-md border border-border bg-background/60 p-4 text-sm">
              <p className="font-medium">{creditsState.message}</p>
              <p className="text-sm">
                Credits: {creditsState.value ?? "not set"}
              </p>
              {creditsState.note ? (
                <p className="text-xs text-muted-foreground">{creditsState.note}</p>
              ) : null}
              {creditsState.data ? (
                <pre className="overflow-x-auto rounded bg-muted p-3 text-xs text-muted-foreground">
                  {JSON.stringify(creditsState.data, null, 2)}
                </pre>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
};

export default SystemCheck;
