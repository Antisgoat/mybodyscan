import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, ChevronRight, Loader2, PauseCircle, Play, RefreshCcw, Settings2 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { BottomNav } from "@/components/BottomNav";
import { loadAllPrograms, matchScore, type CatalogEntry } from "@/lib/coach/catalog";
import type { ProgramGoal, ProgramLevel, ProgramEquipment } from "@/lib/coach/types";
import { getPlan, getWorkouts, setWorkoutPlanStatusRemote } from "@/lib/workouts";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useDemoMode } from "@/components/DemoModeProvider";
import { useClaims } from "@/lib/claims";
import { useSubscription } from "@/hooks/useSubscription";
import { startCatalogProgram } from "@/lib/programs/startProgram";
import { toast } from "@/hooks/use-toast";

const goalLabels: Record<ProgramGoal, string> = {
  hypertrophy: "Build muscle",
  strength: "Strength",
  cut: "Lose fat / Recomp",
  general: "Performance",
};

const levelLabels: Record<ProgramLevel, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

const equipmentLabels: Record<ProgramEquipment, string> = {
  none: "Bodyweight",
  dumbbells: "Dumbbells",
  kettlebells: "Kettlebells",
  barbell: "Barbell",
  machines: "Machines",
  bands: "Bands",
};

const dayNames: Array<"Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"> = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

function toIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function next7Days(): Array<{ iso: string; day: string }> {
  const today = new Date();
  return Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date(today);
    d.setDate(today.getDate() + idx);
    return { iso: toIso(d), day: dayNames[d.getDay()] };
  });
}

function planDaysPerWeek(plan: any): number {
  const days = Array.isArray(plan?.days) ? plan.days : [];
  const workoutDays = days.filter((d: any) => Array.isArray(d?.exercises) && d.exercises.length > 0);
  return workoutDays.length;
}

function dayExercisesCount(plan: any, dayName: string): number {
  const day = Array.isArray(plan?.days)
    ? plan.days.find((d: any) => d?.day === dayName)
    : null;
  return Array.isArray(day?.exercises) ? day.exercises.length : 0;
}

export default function ProgramsCatalog() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const demo = useDemoMode();
  const { claims } = useClaims();
  const { subscription } = useSubscription();
  const { profile } = useUserProfile();

  const [startingProgramId, setStartingProgramId] = useState<string | null>(null);
  const [endingPlan, setEndingPlan] = useState<"paused" | "ended" | null>(null);

  const planQuery = useQuery({
    queryKey: ["workouts", "plan"],
    queryFn: () => getPlan(),
    staleTime: 10_000,
  });

  const workoutsQuery = useQuery({
    queryKey: ["workouts", "workouts"],
    queryFn: () => getWorkouts(),
    staleTime: 10_000,
  });

  const catalogQuery = useQuery({
    queryKey: ["programs", "catalog"],
    queryFn: () => loadAllPrograms(),
    staleTime: 60_000,
  });

  const activePlan = planQuery.data;
  const activeDaysPerWeek = planDaysPerWeek(activePlan);
  const todayName = dayNames[new Date().getDay()];
  const todayIso = toIso(new Date());
  const todayTotal = activePlan ? dayExercisesCount(activePlan, todayName) : 0;
  const todayDone = workoutsQuery.data?.progress?.[todayIso]?.length ?? 0;

  const recommendedGoal: ProgramGoal | undefined = useMemo(() => {
    const goal = profile?.goal;
    if (goal === "lose_fat") return "cut";
    if (goal === "gain_muscle") return "hypertrophy";
    if (goal === "improve_heart") return "general";
    return undefined;
  }, [profile?.goal]);

  const recommendedPrograms = useMemo(() => {
    const entries = catalogQuery.data ?? [];
    if (!entries.length) return [];
    return entries
      .map((entry) => ({
        entry,
        score: matchScore(entry.meta, {
          goal: recommendedGoal,
        }),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((r) => r.entry);
  }, [catalogQuery.data, recommendedGoal]);

  const popularPrograms = useMemo(() => {
    const entries = catalogQuery.data ?? [];
    // "Popular" heuristic: mid-range schedules (3-4 d/wk) and beginner-friendly.
    return entries
      .slice()
      .sort((a, b) => {
        const aScore =
          (a.meta.daysPerWeek === 4 ? 2 : a.meta.daysPerWeek === 3 ? 1 : 0) +
          (a.meta.level === "beginner" ? 1 : 0);
        const bScore =
          (b.meta.daysPerWeek === 4 ? 2 : b.meta.daysPerWeek === 3 ? 1 : 0) +
          (b.meta.level === "beginner" ? 1 : 0);
        return bScore - aScore;
      })
      .slice(0, 3);
  }, [catalogQuery.data]);

  const templates = useMemo(() => {
    const entries = catalogQuery.data ?? [];
    const exclude = new Set([
      ...recommendedPrograms.map((e) => e.meta.id),
      ...popularPrograms.map((e) => e.meta.id),
    ]);
    return entries.filter((e) => !exclude.has(e.meta.id));
  }, [catalogQuery.data, popularPrograms, recommendedPrograms]);

  const retryAll = () => {
    void Promise.all([
      catalogQuery.refetch(),
      planQuery.refetch(),
      workoutsQuery.refetch(),
    ]);
  };

  const endOrPause = async (status: "paused" | "ended") => {
    if (!activePlan?.id) return;
    setEndingPlan(status);
    try {
      await setWorkoutPlanStatusRemote({ planId: activePlan.id, status });
      toast({ title: status === "paused" ? "Plan paused" : "Plan ended" });
      await qc.invalidateQueries({ queryKey: ["workouts", "plan"] });
      await qc.invalidateQueries({ queryKey: ["workouts", "workouts"] });
    } catch (err: any) {
      toast({
        title: "Could not update plan",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setEndingPlan(null);
    }
  };

  const renderProgramCard = (entry: CatalogEntry, variant?: "recommended" | "popular") => {
    const meta = entry.meta;
    const program = entry.program;
    const days = meta.daysPerWeek;
    const time = meta.durationPerSessionMin ? `${meta.durationPerSessionMin} min` : "~45 min";
    const equip = (meta.equipment?.length ? meta.equipment : ["none"])
      .map((e) => equipmentLabels[e] ?? e)
      .join(" • ");
    const difficulty = levelLabels[meta.level];
    const badge = variant === "recommended" ? "Recommended" : variant === "popular" ? "Popular" : null;

    return (
      <Card key={meta.id} className="overflow-hidden border bg-card/70">
        <div className="relative">
          <AspectRatio ratio={16 / 8}>
            {meta.heroImg ? (
              <img src={meta.heroImg} alt={program.title} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-primary/25 via-primary/10 to-background" />
            )}
          </AspectRatio>
          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {badge ? (
              <Badge className="bg-primary text-primary-foreground">{badge}</Badge>
            ) : null}
          </div>
        </div>
        <CardContent className="space-y-3 p-5">
          <div className="space-y-1">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-semibold text-foreground">{program.title}</h3>
              <Badge variant="secondary" className="shrink-0">
                {goalLabels[meta.goal]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {days} days/week • {time} • {equip}
            </p>
            <p className="text-xs text-muted-foreground">Difficulty: {difficulty}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => nav(`/programs/${meta.id}`)}
            >
              Preview
            </Button>
            <Button
              type="button"
              onClick={async () => {
                setStartingProgramId(meta.id);
                try {
                  await startCatalogProgram({
                    entry,
                    demo,
                    claims: (claims as any) ?? null,
                    subscription: (subscription as any) ?? null,
                    navigate: nav,
                  });
                } finally {
                  setStartingProgramId(null);
                }
              }}
              disabled={startingProgramId === meta.id}
            >
              {startingProgramId === meta.id ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Starting…
                </span>
              ) : (
                "Start"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const loading = catalogQuery.isLoading || planQuery.isLoading || workoutsQuery.isLoading;
  const errorMessage =
    (catalogQuery.error as any)?.message ||
    (planQuery.error as any)?.message ||
    (workoutsQuery.error as any)?.message ||
    null;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Plans – MyBodyScan" description="Choose and manage your workout plan." />
      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
        {loading ? (
          <div className="space-y-4">
            <div className="h-10 w-1/2 animate-pulse rounded bg-muted/40" />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="h-40 animate-pulse rounded-lg bg-muted/30" />
              <div className="h-40 animate-pulse rounded-lg bg-muted/30" />
            </div>
          </div>
        ) : errorMessage ? (
          <Card className="border bg-card/60">
            <CardContent className="flex flex-col gap-3 p-6">
              <div className="text-lg font-semibold">We couldn’t load Plans</div>
              <div className="text-sm text-muted-foreground">
                Please check your connection and try again.
              </div>
              <Button onClick={retryAll} className="w-fit">
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : activePlan ? (
          <>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold text-foreground">Your plan</h1>
              <p className="text-sm text-muted-foreground">
                Keep your schedule simple. We’ll take you straight to Today when you’re ready.
              </p>
            </div>

            <Card className="border bg-card/60">
              <CardHeader className="space-y-2">
                <CardTitle className="text-2xl">{activePlan.title || "Active plan"}</CardTitle>
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                  <span>{activeDaysPerWeek || 0} days/week</span>
                  <span>•</span>
                  <span>
                    Next workout:{" "}
                    {todayTotal > 0 ? `${todayName} (${todayTotal} exercises)` : "Rest day"}
                  </span>
                  <span>•</span>
                  <span>
                    Today progress: {todayDone} / {todayTotal}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => nav("/workouts")} className="gap-2">
                    <Play className="h-4 w-4" /> Open today’s workout
                  </Button>
                  <Button variant="outline" onClick={() => nav("/programs/active/edit")} className="gap-2">
                    <Settings2 className="h-4 w-4" /> Edit plan
                  </Button>
                  <Button variant="outline" onClick={() => nav("/programs/customize?fromActive=1")} className="gap-2">
                    <RefreshCcw className="h-4 w-4" /> Regenerate plan
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => void endOrPause("paused")}
                    disabled={endingPlan === "paused" || endingPlan === "ended"}
                    className="gap-2"
                  >
                    <PauseCircle className="h-4 w-4" />
                    {endingPlan === "paused" ? "Pausing…" : "Pause"}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => void endOrPause("ended")}
                    disabled={endingPlan === "paused" || endingPlan === "ended"}
                  >
                    {endingPlan === "ended" ? "Ending…" : "End plan"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border bg-card/60">
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl">Upcoming week</CardTitle>
                <p className="text-sm text-muted-foreground">
                  What’s next, with completion status.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {next7Days().map(({ iso, day }) => {
                  const total = dayExercisesCount(activePlan, day);
                  const done = workoutsQuery.data?.progress?.[iso]?.length ?? 0;
                  const completed = total > 0 && done >= total;
                  return (
                    <div key={iso} className="flex items-center justify-between rounded-md border bg-background/60 p-3 text-sm">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium text-foreground">
                            {day}{" "}
                            <span className="text-xs text-muted-foreground">
                              ({new Date(iso).toLocaleDateString()})
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {total > 0 ? `${total} exercises` : "Rest day"}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs">
                        {total > 0 ? (
                          <Badge variant={completed ? "default" : "secondary"}>
                            {done}/{total}
                          </Badge>
                        ) : (
                          <Badge variant="outline">Rest</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h1 className="text-3xl font-semibold text-foreground">Choose your plan</h1>
              <p className="text-sm text-muted-foreground">
                Pick a template or build a plan in minutes.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Button onClick={() => nav("/programs/customize")} className="gap-2">
                Build my plan <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={() => nav("/programs/quiz")}>
                Take the quick quiz
              </Button>
            </div>

            <Card className="border bg-card/60">
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl">Recommended</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Top picks based on what we know so far.
                </p>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                {recommendedPrograms.length
                  ? recommendedPrograms.map((e) => renderProgramCard(e, "recommended"))
                  : (
                      <div className="col-span-full text-sm text-muted-foreground">
                        No recommendations yet — browse templates below.
                      </div>
                    )}
              </CardContent>
            </Card>

            <Card className="border bg-card/60">
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl">Popular</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                {popularPrograms.map((e) => renderProgramCard(e, "popular"))}
              </CardContent>
            </Card>

            <Card className="border bg-card/60">
              <CardHeader className="space-y-1">
                <CardTitle className="text-xl">Templates</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                {templates.map((e) => renderProgramCard(e))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
