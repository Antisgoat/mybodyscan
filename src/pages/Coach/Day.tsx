import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronLeft, Timer } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import {
  applyDeloadToDay,
  computeNextTargets,
  flattenDay,
  isDeloadWeek,
  nextProgressionHint,
} from "@/lib/coach/progression";
import type { Day as ProgramDay, Exercise, ExerciseSubstitution } from "@/lib/coach/types";
import { loadAllPrograms, type CatalogEntry } from "@/lib/coach/catalog";
import { workoutLogsCol } from "@/lib/db/coachPaths";
import { addDoc, setDoc } from "@/lib/dbWrite";
import { doc, getDocs, limit, orderBy, query, serverTimestamp } from "firebase/firestore";
import { DemoWriteButton } from "@/components/DemoWriteGuard";

const DEFAULT_PROGRAM_ID = "beginner-full-body";

type SetEntry = {
  done: boolean;
  reps: string;
  weight: string;
};

type StructuredBlock = {
  title: string;
  exercises: Array<{
    exercise: Exercise;
    displayName: string;
    globalIndex: number;
    substitution?: ExerciseSubstitution;
  }>;
};

function formatTimer(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function clampIndex(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function parseLoggedNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.replace(",", ".");
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number.parseFloat(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function structureBlocks(
  day: ProgramDay | undefined,
  substitutions?: Record<number, ExerciseSubstitution | undefined>
): StructuredBlock[] {
  if (!day) return [];
  let cursor = 0;
  return day.blocks.map((block) => ({
    title: block.title,
    exercises: block.exercises.map((exercise) => {
      const index = cursor;
      const substitution = substitutions?.[index];
      cursor += 1;
      return {
        exercise,
        displayName: substitution?.name ?? exercise.name,
        globalIndex: index,
        substitution,
      };
    }),
  }));
}

export default function CoachDay() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [setData, setSetData] = useState<Record<string, SetEntry>>({});
  const [activeTimers, setActiveTimers] = useState<Record<string, number>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [startTime] = useState(() => Date.now());
  const [programEntries, setProgramEntries] = useState<CatalogEntry[]>([]);
  const [isLoadingPrograms, setIsLoadingPrograms] = useState(true);
  const [selectedSubstitutions, setSelectedSubstitutions] = useState<
    Record<number, ExerciseSubstitution>
  >({});
  const [activeSwap, setActiveSwap] = useState<
    { index: number; options: ExerciseSubstitution[]; originalName: string } | null
  >(null);
  const [nextTargets, setNextTargets] = useState<string[] | null>(null);

  useEffect(() => {
    let mounted = true;
    setIsLoadingPrograms(true);
    loadAllPrograms()
      .then((items) => {
        if (!mounted) return;
        setProgramEntries(items);
      })
      .finally(() => {
        if (mounted) {
          setIsLoadingPrograms(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const programMap = useMemo(() => {
    return programEntries.reduce<Record<string, CatalogEntry>>((acc, entry) => {
      acc[entry.meta.id] = entry;
      return acc;
    }, {});
  }, [programEntries]);

  const programIdParam = searchParams.get("programId") ?? DEFAULT_PROGRAM_ID;
  const fallbackProgram = programMap[DEFAULT_PROGRAM_ID]?.program ?? programEntries[0]?.program ?? null;
  const rawProgram = programMap[programIdParam]?.program ?? fallbackProgram;

  const weekParam = Number.parseInt(searchParams.get("week") ?? "0", 10);
  const safeWeekIdx = rawProgram?.weeks.length
    ? clampIndex(weekParam, 0, rawProgram.weeks.length - 1)
    : 0;
  const week = rawProgram?.weeks?.[safeWeekIdx];

  const dayParam = Number.parseInt(searchParams.get("day") ?? "0", 10);
  const safeDayIdx = week?.days?.length ? clampIndex(dayParam, 0, week.days.length - 1) : 0;
  const day = week?.days?.[safeDayIdx];
  const isCurrentWeekDeload = rawProgram ? isDeloadWeek(safeWeekIdx, rawProgram.deloadWeeks) : false;
  const effectiveDay = useMemo(() => {
    if (!day) return undefined;
    return isCurrentWeekDeload ? applyDeloadToDay(day) : day;
  }, [day, isCurrentWeekDeload]);

  const substitutionDisplayMap = useMemo(() => {
    const entries = Object.entries(selectedSubstitutions);
    if (!entries.length) return {} as Record<number, string>;
    return entries.reduce<Record<number, string>>((acc, [key, value]) => {
      if (value?.name) {
        acc[Number.parseInt(key, 10)] = value.name;
      }
      return acc;
    }, {});
  }, [selectedSubstitutions]);

  const blocks = useMemo(
    () => structureBlocks(effectiveDay, selectedSubstitutions),
    [effectiveDay, selectedSubstitutions]
  );
  const baseFlattened = useMemo(() => (effectiveDay ? flattenDay(effectiveDay) : []), [effectiveDay]);
  const flattened = useMemo(
    () => (effectiveDay ? flattenDay(effectiveDay, substitutionDisplayMap) : []),
    [effectiveDay, substitutionDisplayMap]
  );
  const hasActiveTimers = Object.keys(activeTimers).length > 0;

  useEffect(() => {
    setSelectedSubstitutions({});
  }, [effectiveDay]);

  useEffect(() => {
    if (!effectiveDay) return;
    const initial: Record<string, SetEntry> = {};
    baseFlattened.forEach((row) => {
      const key = `${row.exIdx}-${row.set}`;
      initial[key] = {
        done: false,
        reps: row.targetReps,
        weight: "",
      };
    });
    setSetData(initial);
    setActiveTimers({});
  }, [effectiveDay, baseFlattened]);

  useEffect(() => {
    if (!hasActiveTimers) return;
    const timer = window.setInterval(() => {
      setActiveTimers((prev) => {
        const next: Record<string, number> = {};
        Object.entries(prev).forEach(([key, value]) => {
          const remaining = Math.max(0, value - 1);
          if (remaining > 0) {
            next[key] = remaining;
          }
        });
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [hasActiveTimers]);

  useEffect(() => {
    let cancelled = false;

    async function loadTargets() {
      const user = auth.currentUser;
      if (!effectiveDay || !rawProgram || !user) {
        if (!cancelled) {
          setNextTargets([]);
        }
        return;
      }

      try {
        const logsRef = workoutLogsCol(user.uid);
        const recentQuery = query(logsRef, orderBy("completedAt", "desc"), limit(20));
        const snapshot = await getDocs(recentQuery);
        const entries = snapshot.docs.map((docSnap) => docSnap.data());
        const lastMatch = entries.find(
          (entry) => entry?.programId === rawProgram.id && entry?.dayIdx === safeDayIdx
        );

        if (!lastMatch || !Array.isArray(lastMatch.sets)) {
          if (!cancelled) {
            setNextTargets([]);
          }
          return;
        }

        const setMap = new Map<string, { reps: number; weight?: number }[]>();
        lastMatch.sets.forEach((item: any) => {
          const planName = typeof item?.exercise === "string" ? item.exercise : "";
          if (!planName) return;
          const repsValue = parseLoggedNumber(item?.reps);
          if (repsValue === null) return;
          const weightValue = parseLoggedNumber(item?.weight);
          const bucket = setMap.get(planName) ?? [];
          bucket.push({ reps: repsValue, weight: weightValue ?? undefined });
          setMap.set(planName, bucket);
        });

        if (setMap.size === 0) {
          if (!cancelled) {
            setNextTargets([]);
          }
          return;
        }

        const suggestions: string[] = [];
        effectiveDay.blocks.forEach((block) => {
          block.exercises.forEach((exercise) => {
            const lastSets = setMap.get(exercise.name) ?? [];
            if (!lastSets.length) {
              suggestions.push(`${exercise.name} maintain`);
              return;
            }
            const { suggestion } = computeNextTargets({
              exerciseName: exercise.name,
              lastSets,
              planTarget: { sets: exercise.sets, reps: exercise.reps, rir: exercise.rir },
            });
            suggestions.push(`${exercise.name} ${suggestion}`);
          });
        });

        if (!cancelled) {
          setNextTargets(suggestions);
        }
      } catch (error) {
        if (!cancelled) {
          setNextTargets([]);
        }
      }
    }

    setNextTargets(null);
    void loadTargets();

    return () => {
      cancelled = true;
    };
  }, [effectiveDay, rawProgram?.id, safeDayIdx]);

  const updateSet = (key: string, partial: Partial<SetEntry>) => {
    setSetData((prev) => {
      const existing = prev[key] ?? { done: false, reps: "", weight: "" };
      return { ...prev, [key]: { ...existing, ...partial } };
    });
  };

  const startTimer = (key: string, duration?: number) => {
    if (!duration) return;
    setActiveTimers((prev) => ({ ...prev, [key]: duration }));
  };

  const handleChooseSubstitution = (choice?: ExerciseSubstitution) => {
    if (!activeSwap) return;
    setSelectedSubstitutions((prev) => {
      const next = { ...prev };
      if (!choice) {
        delete next[activeSwap.index];
      } else {
        next[activeSwap.index] = choice;
      }
      return next;
    });
    setActiveSwap(null);
  };

  const handleComplete = async () => {
    if (!day || !rawProgram) return;
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "Please sign in", description: "You need an account to log workouts." });
      return;
    }

    const setEntries = flattened.map((row) => {
      const key = `${row.exIdx}-${row.set}`;
      const entry = setData[key];
      const payload: {
        exercise: string;
        set: number;
        reps: string;
        done: boolean;
        weight?: string;
        performedExercise?: string;
        substitutionName?: string;
      } = {
        exercise: row.planName,
        set: row.set,
        reps: entry?.reps ?? row.targetReps,
        done: entry?.done ?? false,
      };
      if (entry?.weight) {
        payload.weight = entry.weight;
      }
      const substitution = selectedSubstitutions[row.exIdx];
      if (substitution) {
        payload.performedExercise = row.name;
        payload.substitutionName = substitution.name;
      } else if (row.name !== row.planName) {
        payload.performedExercise = row.name;
      }
      return payload;
    });

    const allDone = setEntries.every((entry) => entry.done === true);
    if (!allDone) {
      const confirmFinish = window.confirm(
        "Some sets are still unchecked. Mark the day complete anyway?"
      );
      if (!confirmFinish) return;
    }

    setIsSaving(true);
    try {
      const logsRef = workoutLogsCol(user.uid);
      await addDoc(logsRef, {
        programId: rawProgram.id,
        weekIdx: safeWeekIdx,
        dayIdx: safeDayIdx,
        completedAt: serverTimestamp(),
        durationSec: Math.round((Date.now() - startTime) / 1000),
        sets: setEntries,
      });

      await setDoc(
        doc(db, "users", user.uid, "coach", "profile"),
        {
          currentProgramId: rawProgram.id,
          activeProgramId: rawProgram.id,
          lastCompletedWeekIdx: safeWeekIdx,
          lastCompletedDayIdx: safeDayIdx,
          currentWeekIdx: safeWeekIdx,
          currentDayIdx: safeDayIdx,
        },
        { merge: true }
      );

      toast({ title: "Workout logged", description: "Great job completing your session." });
      navigate("/coach", { replace: true });
    } catch (error) {
      toast({
        title: "Unable to save workout",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingPrograms || !rawProgram) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <Seo title="Coach Day" description="Workout details" />
        <AppHeader />
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          <NotMedicalAdviceBanner />
          <div className="h-48 animate-pulse rounded-lg bg-muted/40" />
          <div className="h-6 w-1/2 animate-pulse rounded bg-muted/40" />
          <div className="h-6 w-2/3 animate-pulse rounded bg-muted/40" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!day) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <Seo title="Coach Day" description="Workout details" />
        <AppHeader />
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
          <NotMedicalAdviceBanner />
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              This workout day could not be found.
            </CardContent>
          </Card>
          <Button variant="outline" onClick={() => navigate("/coach")}>Back to Coach</Button>
        </main>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title={`${day.name} – ${rawProgram.title}`} description="Log your sets and reps." />
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-6">
        <NotMedicalAdviceBanner />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{rawProgram.title}</p>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">{day.name}</h1>
              {isCurrentWeekDeload && (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  Deload week
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Week {safeWeekIdx + 1} • Day {safeDayIdx + 1}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{flattened.length} total sets</p>
          </div>
        </div>

        {nextTargets !== null && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm leading-relaxed">
            <span className="font-semibold text-primary">Next session targets:</span>{" "}
            {nextTargets.length
              ? nextTargets.join("; ")
              : "Complete this day once to generate personalized targets."}
          </div>
        )}

        {blocks.map((block, blockIdx) => (
          <section key={blockIdx} className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{block.title}</h2>
            {block.exercises.map(({ exercise, displayName, globalIndex, substitution }) => (
              <Card key={globalIndex}>
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-xl">{displayName}</CardTitle>
                      {substitution ? (
                        <p className="text-xs text-muted-foreground">Swapped from {exercise.name}</p>
                      ) : null}
                    </div>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0 text-xs"
                      onClick={() =>
                        setActiveSwap({
                          index: globalIndex,
                          options: exercise.substitutions ?? [],
                          originalName: exercise.name,
                        })
                      }
                    >
                      Swap
                    </Button>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {exercise.sets} sets • {exercise.reps} target reps
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {nextProgressionHint(exercise)}
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Array.from({ length: exercise.sets }).map((_, setIndex) => {
                    const setNumber = setIndex + 1;
                    const key = `${globalIndex}-${setNumber}`;
                    const entry = setData[key];
                    const timerValue = activeTimers[key];
                    return (
                      <div
                        key={key}
                        className="flex flex-col gap-3 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id={`${key}-checkbox`}
                            checked={entry?.done ?? false}
                            onCheckedChange={(checked) => updateSet(key, { done: checked === true })}
                          />
                          <label htmlFor={`${key}-checkbox`} className="text-sm font-medium">
                            Set {setNumber}
                          </label>
                        </div>
                        <div className="flex flex-1 flex-wrap items-center gap-3 sm:justify-end">
                          <div className="flex items-center gap-2">
                            <Input
                              value={entry?.reps ?? ""}
                              onChange={(event) => updateSet(key, { reps: event.target.value })}
                              className="h-9 w-20"
                            />
                            <span className="text-xs text-muted-foreground">reps</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              value={entry?.weight ?? ""}
                              onChange={(event) => updateSet(key, { weight: event.target.value })}
                              placeholder="Weight"
                              className="h-9 w-24"
                            />
                            <span className="text-xs text-muted-foreground">lb / kg</span>
                          </div>
                          {exercise.restSec ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => startTimer(key, exercise.restSec)}
                            >
                              <Timer className="mr-1 h-4 w-4" />
                              {timerValue ? formatTimer(timerValue) : `Rest ${exercise.restSec}s`}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            ))}
          </section>
        ))}

        <div className="flex justify-end">
          <DemoWriteButton size="lg" onClick={handleComplete} disabled={isSaving}>
            {isSaving ? "Saving..." : "Mark Day Complete"}
          </DemoWriteButton>
        </div>

        <Dialog open={Boolean(activeSwap)} onOpenChange={(open) => !open && setActiveSwap(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Swap exercise</DialogTitle>
              <DialogDescription>
                Choose an alternative for {activeSwap?.originalName}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => handleChooseSubstitution()}
              >
                Keep {activeSwap?.originalName}
              </Button>
              {activeSwap?.options.length ? (
                <div className="space-y-2">
                  {activeSwap.options.map((option) => {
                    const current = activeSwap
                      ? selectedSubstitutions[activeSwap.index]
                      : undefined;
                    const isActive = current?.name === option.name;
                    return (
                      <Button
                        key={option.name}
                        type="button"
                        variant={isActive ? "default" : "outline"}
                        className="flex h-auto w-full flex-col items-start gap-1 p-3 text-left"
                        onClick={() => handleChooseSubstitution(option)}
                      >
                        <span className="font-medium">{option.name}</span>
                        {option.reason ? (
                          <span className="text-xs text-muted-foreground">{option.reason}</span>
                        ) : null}
                        {option.equipment?.length ? (
                          <div className="flex flex-wrap gap-1">
                            {option.equipment.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px] uppercase tracking-wide">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </Button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No substitutions available yet. Check back soon!
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </main>
      <BottomNav />
    </div>
  );
}
