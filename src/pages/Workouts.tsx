import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dumbbell, Plus } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { useI18n } from "@/lib/i18n";
import {
  generateWorkoutPlan,
  getPlan,
  markExerciseDone,
  getWeeklyCompletion,
} from "@/lib/workouts";
import { isDemoActive } from "@/lib/demoFlag";
import { track } from "@/lib/analytics";
import { toast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { authedFetch } from "@/lib/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Workouts() {
  const { t } = useI18n();
  const location = useLocation();
  const nav = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const requestedPlanId = searchParams.get("plan");
  const startedParam = searchParams.get("started") === "1";
  const fromPlanStartParam = searchParams.get("fromPlanStart") === "1";
  const cameFromPlanStartState = Boolean((location.state as any)?.cameFromPlanStart);
  const planStartSignal = startedParam || fromPlanStartParam || cameFromPlanStartState;
  type WorkoutExercise = {
    id: string;
    name?: string;
    sets?: number | string;
    reps?: string;
  };
  type WorkoutDay = {
    day: string;
    exercises: WorkoutExercise[];
  };
  type WorkoutPlan = {
    id: string;
    title?: string;
    days: WorkoutDay[];
  };
  type BodyFeel = "great" | "ok" | "tired" | "sore" | "";

  const [plan, setPlan] = useState<WorkoutPlan | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [ratio, setRatio] = useState(0);
  const [weekRatio, setWeekRatio] = useState(0);
  const [bodyFeel, setBodyFeel] = useState<BodyFeel>("");
  const [notes, setNotes] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activationPending, setActivationPending] = useState(false);
  const [showPlanStartHint, setShowPlanStartHint] = useState(false);
  const { health: systemHealth, error: healthError } = useSystemHealth();
  const { workoutsConfigured, workoutAdjustConfigured } =
    computeFeatureStatuses(systemHealth ?? undefined);
  const workoutsOfflineMessage = workoutsConfigured
    ? null
    : "Workout APIs are offline. Set VITE_FUNCTIONS_URL or VITE_FUNCTIONS_ORIGIN to enable plan generation.";
  const adjustUnavailableMessage = !workoutAdjustConfigured
    ? "AI workout adjustments require the OpenAI key (OPENAI_API_KEY) on Cloud Functions."
    : null;
  const adjustDisabled = !workoutAdjustConfigured || !workoutsConfigured;

  const todayName = dayNames[new Date().getDay()];
  const todayISO = new Date().toISOString().slice(0, 10);
  const today = plan?.days.find((d) => d.day === todayName);
  const todayExercises = Array.isArray(today?.exercises) ? today.exercises : [];
  const completedCount = completed.length;
  const totalCount = todayExercises.length;

  const loadProgress = useCallback(
    async (p: WorkoutPlan, isCancelled?: () => boolean) => {
      if (!workoutsConfigured || !p || !Array.isArray(p.days)) return;
      const idx = p.days.findIndex((d) => d.day === todayName);
      if (idx < 0) return;
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      try {
        const snap = await getDoc(
          doc(db, `users/${uid}/workoutPlans/${p.id}/progress/${todayISO}`)
        );
        if (isCancelled?.()) return;
        const done = snap.exists()
          ? ((snap.data()?.completed as string[]) ?? [])
          : [];
        if (!isCancelled?.()) {
          setCompleted(done);
          setRatio(
            p.days[idx].exercises.length
              ? done.length / p.days[idx].exercises.length
              : 0
          );
        }
      } catch (error) {
        console.warn("workouts.progress", error);
        if (!isCancelled?.()) {
          setCompleted([]);
          setRatio(0);
        }
      }
    },
    [todayISO, todayName, workoutsConfigured]
  );

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };

    if (!workoutsConfigured) {
      setPlan(null);
      setCompleted([]);
      setRatio(0);
      setWeekRatio(0);
      setActivationPending(false);
      setLoadError(
        "Workouts are disabled because the Cloud Functions base URL isn't configured. Set VITE_FUNCTIONS_URL or VITE_FUNCTIONS_ORIGIN to enable workouts."
      );
      return cleanup;
    }

    const hydrate = async (attempt = 0) => {
      try {
        const currentPlan = await getPlan();
        if (!currentPlan) {
          if (requestedPlanId && attempt < 3) {
            if (!cancelled) {
              setActivationPending(true);
              setLoadError(null);
            }
            retryTimer = setTimeout(
              () => hydrate(attempt + 1),
              800 * (attempt + 1)
            );
            return;
          }
          if (!cancelled) {
            setActivationPending(false);
            setPlan(null);
            setCompleted([]);
            setRatio(0);
            setWeekRatio(0);
            setLoadError(
              "Workouts are unavailable right now. Check your connection or try again later."
            );
          }
          return;
        }
        if (requestedPlanId && currentPlan.id !== requestedPlanId) {
          if (attempt < 3) {
            if (!cancelled) {
              setActivationPending(true);
              setLoadError(null);
            }
            retryTimer = setTimeout(
              () => hydrate(attempt + 1),
              800 * (attempt + 1)
            );
            return;
          }
          if (!cancelled) {
            setActivationPending(false);
            setLoadError(
              "We’re still preparing your new program. Pull down to refresh or try again."
            );
          }
          return;
        }
        if (!cancelled) {
          setActivationPending(false);
          setPlan(currentPlan);
          setLoadError(null);
        }
        await loadProgress(currentPlan as WorkoutPlan, () => cancelled);
        try {
          const wk = await getWeeklyCompletion(currentPlan.id);
          if (!cancelled) {
            setWeekRatio(wk);
          }
        } catch (error) {
          console.warn("workouts.weekly", error);
          if (!cancelled) {
            setWeekRatio(0);
          }
        }
      } catch (error) {
        console.warn("workouts.plan", error);
        const message =
          error instanceof Error && error.message.includes("workouts_disabled")
            ? "Workouts are disabled because the backend URL isn't configured. Set VITE_FUNCTIONS_URL or VITE_FUNCTIONS_ORIGIN to enable workouts."
            : "Workouts are unavailable right now. Check your connection or try again later.";
        if (!cancelled) {
          setActivationPending(false);
          setPlan(null);
          setCompleted([]);
          setRatio(0);
          setWeekRatio(0);
          setLoadError(message);
        }
      }
    };

    void hydrate();

    return cleanup;
  }, [loadProgress, requestedPlanId, workoutsConfigured]);

  const handleToggle = async (exerciseId: string) => {
    if (!plan || !Array.isArray(plan.days)) return;
    const idx = plan.days.findIndex((d) => d.day === todayName);
    if (idx < 0) {
      toast({
        title: "Workout day unavailable",
        description:
          "We couldn’t find today in your plan. Try refreshing or starting a new program.",
        variant: "destructive",
      });
      return;
    }
    const done = !completed.includes(exerciseId);
    try {
      const res = await markExerciseDone(plan.id, idx, exerciseId, done);
      setCompleted(
        done
          ? [...completed, exerciseId]
          : completed.filter((id) => id !== exerciseId)
      );
      setRatio(res.ratio);
      if (done) track("workout_mark_done", { exerciseId });
      if (isDemoActive()) toast({ title: "Sign up to save your progress." });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message === "demo-blocked") {
        toast({
          title: "Create an account",
          description: "Demo mode cannot save workouts.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Update failed",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleGenerate = async () => {
    if (!workoutsConfigured) {
      const description =
        workoutsOfflineMessage ??
        "Workout APIs are offline. Set the Cloud Functions base URL before generating a plan.";
      setLoadError(description);
      toast({ title: "Workouts offline", description, variant: "destructive" });
      return;
    }
    try {
      const res = await generateWorkoutPlan({ focus: "back" });
      if (!res) return;
      const newPlan = { id: res.planId, days: res.days };
      setPlan(newPlan);
      setCompleted([]);
      setRatio(0);
      setWeekRatio(0);
      setLoadError(null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message === "demo-blocked") {
        toast({
          title: "Create an account",
          description: "Demo mode cannot generate plans.",
          variant: "destructive",
        });
        return;
      }
      if (
        typeof message === "string" &&
        message.includes("workouts_disabled")
      ) {
        const description =
          workoutsOfflineMessage ??
          "Workouts are turned off because the Cloud Functions base URL is missing. Add it to enable workout generation.";
        setLoadError(description);
        toast({
          title: "Workouts offline",
          description,
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Unable to generate",
        description: "Please try again later.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    if (
      planStartSignal &&
      plan &&
      (!requestedPlanId || plan.id === requestedPlanId)
    ) {
      setShowPlanStartHint(true);
      toast({
        title: "Plan ready",
        description: "Your new workout program is active.",
      });
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("started");
      nextParams.delete("plan");
      nextParams.delete("fromPlanStart");
      const nextSearch = nextParams.toString();
      nav(
        { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" },
        { replace: true, state: {} }
      );
    }
  }, [location.pathname, nav, plan, planStartSignal, requestedPlanId, searchParams]);

  const formatDelta = (value: number) =>
    value >= 0 ? `+${value}` : `${value}`;

  const submitBodyFeel = async () => {
    if (!plan) return;
    if (!bodyFeel) {
      toast({ title: "Select how your body feels" });
      return;
    }
    if (!workoutsConfigured) {
      const description =
        workoutsOfflineMessage ??
        "Workout APIs are offline. Configure the Cloud Functions URL before adjusting.";
      toast({ title: "Workouts offline", description, variant: "destructive" });
      return;
    }
    if (adjustDisabled) {
      const description =
        adjustUnavailableMessage ??
        workoutsOfflineMessage ??
        "AI workout adjustments are offline. Configure OPENAI_API_KEY to re-enable.";
      toast({
        title: "Adjustments unavailable",
        description,
        variant: "destructive",
      });
      return;
    }
    try {
      setAdjusting(true);
      const res = await authedFetch(`/workouts/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayId: todayName, bodyFeel, notes }),
      });
      const payloadText = await res.text();
      let data: Record<string, unknown> = {};
      if (payloadText) {
        try {
          const parsed = JSON.parse(payloadText);
          if (parsed && typeof parsed === "object") {
            data = parsed as Record<string, unknown>;
          }
        } catch {
          data = {};
        }
      }
      if (!res.ok) {
        const message =
          (data as { error?: string; message?: string })?.error ||
          (data as { error?: string; message?: string })?.message ||
          `adjust_failed_${res.status}`;
        throw new Error(message);
      }
      const mods =
        typeof (data as { mods?: unknown }).mods === "object" &&
        (data as { mods?: unknown }).mods !== null
          ? ((data as { mods?: Record<string, unknown> }).mods ?? {})
          : {};
      const intensityDelta = Number((mods as { intensity?: unknown }).intensity ?? 0);
      const volumeDelta = Number((mods as { volume?: unknown }).volume ?? 0);
      if (today) {
        const deltaSets = Number.isFinite(volumeDelta) ? volumeDelta : 0;
        const next = { ...plan };
        const idx = next.days.findIndex((d) => d.day === todayName);
        if (idx >= 0) {
          next.days = next.days.map((d, i) =>
            i === idx
              ? {
                  ...d,
                  exercises: d.exercises.map((ex) => ({
                    ...ex,
                    sets: Math.max(1, (Number(ex.sets) || 0) + deltaSets),
                  })),
                }
              : d
          );
          setPlan(next);
        }
      }
      const summaryValue = (data as { summary?: unknown }).summary;
      const summary =
        typeof summaryValue === "string" && summaryValue.trim().length
          ? summaryValue.trim()
          : null;
      toast({
        title: "Plan adjusted",
        description:
          summary ??
          `Intensity ${formatDelta(intensityDelta)} · Volume ${formatDelta(volumeDelta)}`,
      });
      setBodyFeel("");
      setNotes("");
    } catch (error: unknown) {
      toast({
        title: "Unable to adjust",
        description: error instanceof Error ? error.message : "Try again",
        variant: "destructive",
      });
    } finally {
      setAdjusting(false);
    }
  };

  if (!plan) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <Seo
          title="Workouts - MyBodyScan"
          description="Track your daily workout routine"
        />
        <main className="max-w-md mx-auto p-6 space-y-6">
          <Card>
            <CardContent className="p-8 text-center">
              <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-4">
                No workout plan yet
              </h3>
              {loadError && (
                <p className="mb-4 text-sm text-destructive">{loadError}</p>
              )}
              {activationPending && (
                <p className="mb-4 text-sm text-muted-foreground">
                  Activating your new program… this usually takes a few seconds.
                </p>
              )}
              {workoutsOfflineMessage && (
                <p className="mb-4 text-sm text-muted-foreground">
                  {workoutsOfflineMessage}
                </p>
              )}
              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => nav("/programs/customize")}
                  className="w-full"
                  disabled={!workoutsConfigured}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Customize my plan
                </Button>
                <Button
                  variant="outline"
                  onClick={() => nav("/programs")}
                  className="w-full"
                >
                  Browse programs
                </Button>
                <Button
                  variant="outline"
                  onClick={handleGenerate}
                  className="w-full"
                  disabled={!workoutsConfigured}
                >
                  Quick start (auto)
                </Button>
                {loadError && workoutsConfigured && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.location.reload()}
                  >
                    Retry loading
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo
        title="Workouts - MyBodyScan"
        description="Track your daily workout routine"
      />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <DemoBanner />
        {healthError ? (
          <Alert variant="destructive">
            <AlertTitle>System health unavailable</AlertTitle>
            <AlertDescription>{healthError}</AlertDescription>
          </Alert>
        ) : null}
        {workoutsOfflineMessage ? (
          <Alert variant="destructive">
            <AlertTitle>Workouts offline</AlertTitle>
            <AlertDescription>{workoutsOfflineMessage}</AlertDescription>
          </Alert>
        ) : null}
        <Card className="border bg-card/60">
          <CardHeader className="space-y-1">
            <CardTitle className="text-lg">Your plan</CardTitle>
            <p className="text-sm text-muted-foreground">
              {plan?.title ? plan.title : "Active plan"} · {plan?.days?.length ?? 0} days/week
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button onClick={() => nav("/programs")} variant="outline" className="w-full">
              Change plan / Programs
            </Button>
            <Button onClick={() => nav("/programs/customize?fromActive=1")} variant="outline" className="w-full">
              Customize plan
            </Button>
            {showPlanStartHint ? (
              <p className="text-xs text-muted-foreground">
                Your new program is active. If today looks wrong, pull down to refresh.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="text-center space-y-2">
          <Dumbbell className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">
            {t("workouts.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {completedCount} of {totalCount} exercises completed
          </p>
          <p className="text-xs text-muted-foreground">
            {Math.round(weekRatio * 100)}% this week
          </p>
        </div>
        <div className="w-full bg-secondary rounded-full h-2">
          <div
            className="bg-primary h-2 rounded-full transition-all"
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        {todayExercises.length > 0 ? (
          <div className="space-y-4">
            {todayExercises.map((ex) => (
              <Card key={ex.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      id={ex.id}
                      checked={completed.includes(ex.id)}
                      onCheckedChange={() => handleToggle(ex.id)}
                    />
                    <div className="flex-1">
                      <h3 className="font-medium text-foreground">{ex.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {Number.isFinite(Number(ex.sets))
                          ? Number(ex.sets)
                          : "—"}{" "}
                        sets × {ex.reps ?? "—"} reps
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="font-medium text-foreground">
                  How did your body feel today?
                </div>
                {adjustUnavailableMessage && (
                  <Alert variant="default" className="border-dashed">
                    <AlertTitle>Adjustments paused</AlertTitle>
                    <AlertDescription>
                      {adjustUnavailableMessage}
                    </AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-wrap gap-2">
                  {["great", "ok", "tired", "sore"].map((v) => (
                    <Button
                      key={v}
                      type="button"
                      variant={bodyFeel === v ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBodyFeel(v as BodyFeel)}
                      disabled={adjustDisabled}
                    >
                      {v === "great"
                        ? "Great"
                        : v === "ok"
                          ? "OK"
                          : v === "tired"
                            ? "Tired"
                            : "Sore"}
                    </Button>
                  ))}
                </div>
                <textarea
                  className="w-full rounded-md border bg-background p-2 text-sm"
                  rows={2}
                  placeholder="Notes (optional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={adjustDisabled}
                />
                <div className="flex justify-end">
                  <Button
                    onClick={submitBodyFeel}
                    disabled={!bodyFeel || adjusting || adjustDisabled}
                  >
                    {adjusting ? "Saving…" : "Save adjustment"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                Rest day
              </h3>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
