import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useUserProfile } from "@/hooks/useUserProfile";
import { toast } from "@/hooks/use-toast";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoToast } from "@/lib/demoToast";
import { db } from "@/lib/firebase";
import { cn } from "@/lib/utils";
import type { Program } from "@/lib/coach/types";
import { loadAllPrograms, type CatalogEntry } from "@/lib/coach/catalog";
import { setDoc } from "@/lib/dbWrite";
import { doc, getDoc } from "firebase/firestore";
import { coachPlanDoc } from "@/lib/db/coachPaths";
import { disabledIfDemo } from "@/lib/demoGuard";
import { useAuthUser } from "@/lib/auth";
import { ErrorBoundary } from "@/components/system/ErrorBoundary";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useCoachTodayAtAGlance } from "@/hooks/useCoachTodayAtAGlance";
import { formatDistanceToNow } from "date-fns";

const DEFAULT_PROGRAM_ID = "beginner-full-body";

const goalCopy: Record<Program["goal"], string> = {
  hypertrophy: "Hypertrophy",
  strength: "Strength",
  cut: "Cut / Recomp",
  general: "General Fitness",
};

function nextTargetFor(program: Program, lastWeek: number, lastDay: number) {
  if (!program.weeks.length) return { weekIdx: 0, dayIdx: 0 };
  if (lastWeek < 0 || lastDay < 0) return { weekIdx: 0, dayIdx: 0 };
  const safeWeek = Math.min(lastWeek, program.weeks.length - 1);
  const weekDays = program.weeks[safeWeek]?.days.length ?? 0;
  if (weekDays && lastDay + 1 < weekDays) {
    return { weekIdx: safeWeek, dayIdx: lastDay + 1 };
  }
  if (safeWeek + 1 < program.weeks.length) {
    return { weekIdx: safeWeek + 1, dayIdx: 0 };
  }
  const finalWeekDays = program.weeks[safeWeek]?.days.length ?? 1;
  return {
    weekIdx: safeWeek,
    dayIdx: Math.min(lastDay, Math.max(finalWeekDays - 1, 0)),
  };
}

export default function CoachOverview() {
  const { profile } = useUserProfile();
  const navigate = useNavigate();
  const location = useLocation();
  const [hydrated, setHydrated] = useState(false);
  const [programEntries, setProgramEntries] = useState<CatalogEntry[]>([]);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(true);
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(
    null
  );
  const [weekIdx, setWeekIdx] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [planExists, setPlanExists] = useState<boolean | null>(null);
  const { user, authReady } = useAuthUser();
  const appCheckReady = true;
  const uid = authReady ? (user?.uid ?? null) : null;
  const demo = useDemoMode();
  const { disabled: demoDisabled, title: demoTitle } = disabledIfDemo();
  const readOnlyDemo = demo && !user;
  const signUpHref = `/auth?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
  const { totals, latestScan } = useCoachTodayAtAGlance();
  const todayCaloriesGoal = profile?.calorieTarget;
  const todayProteinGoalGrams = profile?.proteinFloor;

  useEffect(() => {
    let isMounted = true;
    setIsLoadingPrograms(true);
    loadAllPrograms()
      .then((entries) => {
        if (!isMounted) return;
        setProgramEntries(entries);
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingPrograms(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const programMap = useMemo(() => {
    return programEntries.reduce<Record<string, CatalogEntry>>((acc, entry) => {
      acc[entry.program.id] = entry;
      return acc;
    }, {});
  }, [programEntries]);

  useEffect(() => {
    if (!programEntries.length) return;
    setSelectedProgramId(
      (prev) => prev ?? programEntries[0]?.program.id ?? DEFAULT_PROGRAM_ID
    );
  }, [programEntries]);

  const rawActiveProgramId =
    profile?.activeProgramId ?? profile?.currentProgramId ?? null;
  const activeProgramId = planExists === false ? null : rawActiveProgramId;

  useEffect(() => {
    if (demo) {
      setPlanExists(true);
      return;
    }
    if (!authReady || !appCheckReady || !uid) {
      setPlanExists(null);
      return;
    }

    let cancelled = false;

    const checkPlan = async () => {
      try {
        const snapshot = await getDoc(coachPlanDoc(uid));
        if (!cancelled) {
          setPlanExists(snapshot.exists());
        }
      } catch (error: any) {
        if (!cancelled) {
          setPlanExists(false);
        }
      }
    };

    void checkPlan();

    return () => {
      cancelled = true;
    };
  }, [demo, authReady, appCheckReady, uid, rawActiveProgramId]);

  useEffect(() => {
    if (!profile || !programEntries.length || hydrated) return;
    const fallbackId = programEntries[0]?.program.id ?? DEFAULT_PROGRAM_ID;
    const nextId =
      activeProgramId && programMap[activeProgramId]
        ? activeProgramId
        : fallbackId;
    setSelectedProgramId(nextId);
    const weeksInProgram = programMap[nextId]?.program.weeks.length ?? 1;
    const initialWeek =
      typeof profile.currentWeekIdx === "number"
        ? profile.currentWeekIdx
        : typeof profile.lastCompletedWeekIdx === "number"
          ? profile.lastCompletedWeekIdx
          : 0;
    setWeekIdx(
      Math.max(0, Math.min(initialWeek, Math.max(weeksInProgram - 1, 0)))
    );
    setHydrated(true);
  }, [profile, programEntries, hydrated, programMap, activeProgramId]);

  const selectedEntry = selectedProgramId
    ? programMap[selectedProgramId]
    : undefined;
  const program = selectedEntry?.program;
  const meta = selectedEntry?.meta;

  useEffect(() => {
    if (!program) return;
    if (!program.weeks[weekIdx]) {
      setWeekIdx(
        program.weeks.length ? Math.max(0, program.weeks.length - 1) : 0
      );
    }
  }, [program, weekIdx]);

  const lastWeekForProgram = useMemo(() => {
    if (!profile || !program) return -1;
    if (activeProgramId !== program.id) return -1;
    if (typeof profile.lastCompletedWeekIdx === "number")
      return profile.lastCompletedWeekIdx;
    if (typeof profile.currentWeekIdx === "number")
      return profile.currentWeekIdx;
    return -1;
  }, [profile, program?.id, activeProgramId]);

  const lastDayForProgram = useMemo(() => {
    if (!profile || !program) return -1;
    if (activeProgramId !== program.id) return -1;
    if (typeof profile.lastCompletedDayIdx === "number")
      return profile.lastCompletedDayIdx;
    if (typeof profile.currentDayIdx === "number") return profile.currentDayIdx;
    return -1;
  }, [profile, program?.id, activeProgramId]);

  const nextTarget = useMemo(() => {
    if (!program) return { weekIdx: 0, dayIdx: 0 };
    return nextTargetFor(program, lastWeekForProgram, lastDayForProgram);
  }, [program, lastWeekForProgram, lastDayForProgram]);

  const persistProfile = async (partial: Record<string, unknown>) => {
    if (demo) {
      demoToast();
      return;
    }
    if (!authReady || !user) return;
    try {
      setIsSaving(true);
      await setDoc(doc(db, "users", user.uid, "coach", "profile"), partial, {
        merge: true,
      });
    } catch (error) {
      toast({
        title: "Unable to save preference",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleProgramChange = (value: string) => {
    setSelectedProgramId(value);
    setWeekIdx(0);
    persistProfile({
      currentProgramId: value,
      activeProgramId: value,
      currentWeekIdx: 0,
      currentDayIdx: 0,
    });
  };

  const handlePrevWeek = () => {
    setWeekIdx((idx) => Math.max(0, idx - 1));
  };

  const handleNextWeek = () => {
    if (!program) return;
    setWeekIdx((idx) => Math.min(program.weeks.length - 1, idx + 1));
  };

  const handleOpenDay = (dayIdx: number) => {
    if (!program) return;
    navigate(
      `/coach/day?programId=${program.id}&week=${weekIdx}&day=${dayIdx}`
    );
  };

  const currentWeek = program?.weeks[weekIdx] ?? program?.weeks[0];
  const totalWeeks = program?.weeks.length ?? meta?.weeks ?? 0;
  const daysThisWeek = currentWeek?.days.length ?? 0;
  const maxWeekIndex = totalWeeks > 0 ? totalWeeks - 1 : 0;
  const displayWeekCount = totalWeeks > 0 ? totalWeeks : 1;
  const displayWeekIndex =
    totalWeeks > 0 ? Math.min(weekIdx + 1, totalWeeks) : 1;
  const showEmptyState = !isLoadingPrograms && !program;

  const initializing = false;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo
        title="Coach – MyBodyScan"
        description="Follow your bodybuilding-style program."
      />
      <ErrorBoundary
        title="Coach is unavailable"
        description="Retry to load your personalized plan."
      >
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
          <NotMedicalAdviceBanner />
          <Card className="border bg-card/60">
            <CardHeader className="space-y-1">
              <CardTitle className="text-lg">Today at a glance</CardTitle>
              <p className="text-xs text-muted-foreground">
                Real-time totals from today’s log.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Today’s calories</span>
                <span className="font-medium">
                  {Math.round(totals.calories)}{" "}
                  {typeof todayCaloriesGoal === "number" && todayCaloriesGoal > 0
                    ? ` / Goal ${Math.round(todayCaloriesGoal)}`
                    : "/ Goal —"}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-muted-foreground">Macros</span>
                <span className="font-medium">
                  Protein: {Math.round(totals.proteinGrams)}g
                  {typeof todayProteinGoalGrams === "number" &&
                  todayProteinGoalGrams > 0
                    ? ` (Goal ${Math.round(todayProteinGoalGrams)}g)`
                    : ""}
                  {" · "}Carbs: {Math.round(totals.carbGrams)}g{" · "}Fat:{" "}
                  {Math.round(totals.fatGrams)}g
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last scan</span>
                <span className="font-medium">
                  {latestScan?.createdAt
                    ? formatDistanceToNow(latestScan.createdAt, {
                        addSuffix: true,
                      })
                    : "No scans yet"}
                </span>
              </div>
            </CardContent>
          </Card>
          {readOnlyDemo && (
            <Alert variant="default" className="border-primary/40 bg-primary/5">
              <AlertTitle>Demo preview</AlertTitle>
              <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Sign up to unlock personalized programs, save progress, and
                  access full coach features.
                </span>
                <Button asChild size="sm" variant="outline">
                  <a href={signUpHref}>Sign up to use this feature</a>
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {planExists === false && !demo ? (
            <Alert variant="default" data-testid="coach-plan-missing">
              <AlertTitle>No plan yet — create one</AlertTitle>
              <AlertDescription>
                Regenerate your weekly plan or open chat for quick guidance.
                Chat stays available while you set things up.
              </AlertDescription>
            </Alert>
          ) : null}
          {initializing && (
            <Card className="border border-dashed border-primary/40 bg-primary/5">
              <CardContent className="text-sm text-primary">
                Initializing secure coach services… Your plans will appear
                shortly.
              </CardContent>
            </Card>
          )}
          {(profile || planExists === false) && !activeProgramId && (
            <Card className="border border-dashed border-primary/40 bg-primary/5">
              <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      Choose your training plan
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {planExists === false
                        ? "No coach plan yet. Create one to get a weekly split."
                        : "Take the quick quiz or browse all programs to set your next block."}
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button size="sm" onClick={() => navigate("/programs/quiz")}>
                    Take 60-sec quiz
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate("/programs")}
                  >
                    Browse programs
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <header className="flex flex-col gap-4 rounded-lg border bg-card/40 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <CalendarDays className="h-4 w-4" />
                  Structured Program
                </p>
                <h1 className="mt-1 text-3xl font-semibold">Coach</h1>
                <p className="text-sm text-muted-foreground">
                  Dialed-in bodybuilding days with detailed lifts and recovery
                  guidance.
                </p>
              </div>
              {program && (
                <Badge variant="secondary">{goalCopy[program.goal]}</Badge>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select
                value={program?.id}
                onValueChange={handleProgramChange}
                disabled={
                  demoDisabled ||
                  isSaving ||
                  isLoadingPrograms ||
                  !programEntries.length ||
                  initializing
                }
              >
                <SelectTrigger
                  className="w-full sm:w-64"
                  title={demoDisabled ? demoTitle : undefined}
                >
                  <SelectValue
                    placeholder={
                      isLoadingPrograms
                        ? "Loading programs..."
                        : "Select program"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {programEntries.map((entry) => (
                    <SelectItem key={entry.program.id} value={entry.program.id}>
                      {entry.program.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {totalWeeks
                  ? `${totalWeeks} weeks`
                  : isLoadingPrograms
                    ? "Loading schedule..."
                    : "Program length TBD"}{" "}
                • {daysThisWeek} days this week
              </p>
            </div>
          </header>

          <section className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Current Week
              </p>
              <p className="text-lg font-semibold">
                Week {displayWeekIndex} of {displayWeekCount}
              </p>
              {nextTarget.weekIdx === weekIdx && (
                <p className="text-xs text-muted-foreground">
                  Next up: Day {nextTarget.dayIdx + 1}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevWeek}
                disabled={weekIdx === 0}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleNextWeek}
                disabled={!program || weekIdx >= maxWeekIndex}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </section>

          {showEmptyState ? (
            <Card className="rounded-lg border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              <p>Select a program to see your upcoming training days.</p>
            </Card>
          ) : (
            <div className="space-y-4">
              {currentWeek && currentWeek.days.length ? (
                currentWeek.days.map((day, dayIdx) => {
                  const blocks = Array.isArray(day.blocks) ? day.blocks : [];
                  const totalExercises = blocks.reduce((count, block) => {
                    const exercises = Array.isArray((block as any)?.exercises)
                      ? (block as any).exercises
                      : [];
                    return count + exercises.length;
                  }, 0);
                  const totalSets = blocks.reduce((count, block) => {
                    const exercises = Array.isArray((block as any)?.exercises)
                      ? (block as any).exercises
                      : [];
                    return (
                      count +
                      exercises.reduce((sum: number, exercise: any) => {
                        const sets = Number(exercise?.sets ?? 0);
                        return sum + (Number.isFinite(sets) ? sets : 0);
                      }, 0)
                    );
                  }, 0);
                  const completed =
                    lastWeekForProgram > weekIdx ||
                    (lastWeekForProgram === weekIdx &&
                      lastDayForProgram >= dayIdx);
                  const isNextTarget =
                    nextTarget.weekIdx === weekIdx &&
                    nextTarget.dayIdx === dayIdx;
                  return (
                    <Card
                      key={dayIdx}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleOpenDay(dayIdx)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleOpenDay(dayIdx);
                        }
                      }}
                      className={cn(
                        "group cursor-pointer border transition hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50",
                        completed && "border-muted-foreground/40",
                        isNextTarget && "border-primary shadow-sm"
                      )}
                    >
                      <CardHeader className="flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-xl">
                          {day.name || `Day ${dayIdx + 1}`}
                        </CardTitle>
                        {completed ? (
                          <span className="flex items-center gap-1 text-sm text-muted-foreground">
                            <CheckCircle2 className="h-4 w-4 text-primary" />{" "}
                            Completed
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Tap to start
                          </span>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {blocks.map((block: any, blockIdx: number) => (
                          <div
                            key={blockIdx}
                            className="rounded-md bg-muted/50 p-3"
                          >
                            <p className="text-sm font-medium text-foreground">
                              {block.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {Array.isArray(block.exercises)
                                ? block.exercises
                                    .map(
                                      (exercise: any) => exercise?.name ?? ""
                                    )
                                    .filter(Boolean)
                                    .join(" • ")
                                : ""}
                            </p>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{totalExercises} exercises</span>
                          <span>{totalSets} total sets</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              ) : (
                <Card className="border bg-card/40">
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    No scheduled training days for this week.
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          <Card className="border bg-card/60">
            <CardHeader className="space-y-2">
              <CardTitle className="text-xl">Coach chat</CardTitle>
              <p className="text-sm text-muted-foreground">
                Get near real-time suggestions and regenerate your weekly plan.
                Estimates only — not medical advice.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Conversations are saved to keep context for smarter tweaks.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  navigate("/coach/chat");
                }}
                data-testid="coach-open-chat"
              >
                Open chat
              </Button>
            </CardContent>
          </Card>
        </main>
        <BottomNav />
      </ErrorBoundary>
    </div>
  );
}
