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
import { toast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import { flattenDay, nextProgressionHint } from "@/lib/coach/progression";
import type { Day as ProgramDay, Exercise, Program } from "@/lib/coach/types";
import { loadAllPrograms, type CatalogEntry } from "@/lib/coach/catalog";
import { collection, addDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";

const DEFAULT_PROGRAM_ID = "beginner-full-body";

type SetEntry = {
  done: boolean;
  reps: string;
  weight: string;
};

type StructuredBlock = {
  title: string;
  exercises: Array<{ exercise: Exercise; globalIndex: number }>;
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

function structureBlocks(day: ProgramDay | undefined): StructuredBlock[] {
  if (!day) return [];
  let cursor = 0;
  return day.blocks.map((block) => ({
    title: block.title,
    exercises: block.exercises.map((exercise) => ({
      exercise,
      globalIndex: cursor++,
    })),
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

  const blocks = useMemo(() => structureBlocks(day), [day]);
  const flattened = useMemo(() => (day ? flattenDay(day) : []), [day]);
  const hasActiveTimers = Object.keys(activeTimers).length > 0;

  useEffect(() => {
    if (!day) return;
    const initial: Record<string, SetEntry> = {};
    flattened.forEach((row) => {
      const key = `${row.exIdx}-${row.set}`;
      initial[key] = {
        done: false,
        reps: row.targetReps,
        weight: "",
      };
    });
    setSetData(initial);
    setActiveTimers({});
  }, [day, flattened]);

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
      } = {
        exercise: row.name,
        set: row.set,
        reps: entry?.reps ?? row.targetReps,
        done: entry?.done ?? false,
      };
      if (entry?.weight) {
        payload.weight = entry.weight;
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
      const logsRef = collection(db, "users", user.uid, "workoutLogs");
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
            <h1 className="text-2xl font-semibold">{day.name}</h1>
            <p className="text-xs text-muted-foreground">
              Week {safeWeekIdx + 1} • Day {safeDayIdx + 1}
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{flattened.length} total sets</p>
          </div>
        </div>

        {blocks.map((block, blockIdx) => (
          <section key={blockIdx} className="space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{block.title}</h2>
            {block.exercises.map(({ exercise, globalIndex }) => (
              <Card key={globalIndex}>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-xl">{exercise.name}</CardTitle>
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
          <Button size="lg" onClick={handleComplete} disabled={isSaving}>
            {isSaving ? "Saving..." : "Mark Day Complete"}
          </Button>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
