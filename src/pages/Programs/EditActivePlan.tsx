import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  getPlan,
  setWorkoutPlanStatusRemote,
  updateWorkoutPlanRemote,
  type UpdateWorkoutPlanOp,
} from "@/lib/workouts";

type DayName = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
const DAYS: DayName[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function EditActivePlan() {
  const nav = useNavigate();
  const qc = useQueryClient();

  const planQuery = useQuery({
    queryKey: ["workouts", "plan"],
    queryFn: () => getPlan(),
    staleTime: 15_000,
  });

  const [localPlan, setLocalPlan] = useState<any>(null);
  const [savingOp, setSavingOp] = useState(false);

  useEffect(() => {
    if (planQuery.data) setLocalPlan(planQuery.data);
  }, [planQuery.data]);

  const usedDays = useMemo(() => {
    const days: string[] = Array.isArray(localPlan?.days)
      ? localPlan.days.map((d: any) => String(d.day || ""))
      : [];
    return new Set(days);
  }, [localPlan]);

  const runOp = async (op: UpdateWorkoutPlanOp) => {
    if (!localPlan?.id) return;
    setSavingOp(true);
    try {
      await updateWorkoutPlanRemote({ planId: localPlan.id, op });
      toast({ title: "Saved" });
      await qc.invalidateQueries({ queryKey: ["workouts", "plan"] });
      await qc.invalidateQueries({ queryKey: ["workouts", "workouts"] });
    } catch (err: any) {
      toast({
        title: "Could not save",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingOp(false);
    }
  };

  const updateExerciseLocal = (
    dayIndex: number,
    exerciseIndex: number,
    patch: Partial<{ name: string; sets: number; reps: string }>
  ) => {
    setLocalPlan((prev: any) => {
      if (!prev?.days) return prev;
      const days = prev.days.map((d: any) => ({ ...d, exercises: [...(d.exercises || [])] }));
      const day = days[dayIndex];
      const ex = day?.exercises?.[exerciseIndex];
      if (!day || !ex) return prev;
      day.exercises[exerciseIndex] = {
        ...ex,
        ...patch,
        sets: patch.sets === undefined ? ex.sets : clamp(patch.sets, 1, 10),
      };
      return { ...prev, days };
    });
  };

  const reorderExerciseLocal = (dayIndex: number, fromIndex: number, toIndex: number) => {
    setLocalPlan((prev: any) => {
      const day = prev?.days?.[dayIndex];
      if (!day?.exercises?.length) return prev;
      if (fromIndex < 0 || fromIndex >= day.exercises.length) return prev;
      const clampedTo = clamp(toIndex, 0, day.exercises.length - 1);
      const days = prev.days.map((d: any, idx: number) =>
        idx === dayIndex ? { ...d, exercises: [...d.exercises] } : d
      );
      const list = days[dayIndex].exercises;
      const [item] = list.splice(fromIndex, 1);
      list.splice(clampedTo, 0, item);
      return { ...prev, days };
    });
  };

  const moveExerciseToDayLocal = (
    fromDayIndex: number,
    fromIndex: number,
    toDayIndex: number
  ) => {
    setLocalPlan((prev: any) => {
      const fromDay = prev?.days?.[fromDayIndex];
      const toDay = prev?.days?.[toDayIndex];
      if (!fromDay?.exercises?.length || !toDay) return prev;
      const days = prev.days.map((d: any) => ({ ...d, exercises: [...(d.exercises || [])] }));
      const [item] = days[fromDayIndex].exercises.splice(fromIndex, 1);
      if (!item) return prev;
      days[toDayIndex].exercises.push(item);
      return { ...prev, days };
    });
  };

  const setDayNameLocal = (dayIndex: number, day: DayName) => {
    setLocalPlan((prev: any) => {
      if (!prev?.days?.[dayIndex]) return prev;
      const current = String(prev.days[dayIndex].day || "");
      const used = new Set(prev.days.map((d: any) => String(d.day || "")));
      used.delete(current);
      if (used.has(day)) {
        toast({ title: "Day already used", description: "Pick a different day." });
        return prev;
      }
      const days = prev.days.map((d: any, idx: number) =>
        idx === dayIndex ? { ...d, day } : d
      );
      return { ...prev, days };
    });
  };

  const endPlan = async (status: "paused" | "ended") => {
    if (!localPlan?.id) return;
    setSavingOp(true);
    try {
      await setWorkoutPlanStatusRemote({ planId: localPlan.id, status });
      toast({ title: status === "paused" ? "Plan paused" : "Plan ended" });
      await qc.invalidateQueries({ queryKey: ["workouts", "plan"] });
      await qc.invalidateQueries({ queryKey: ["workouts", "workouts"] });
      nav("/programs", { replace: true });
    } catch (err: any) {
      toast({
        title: "Could not update plan",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingOp(false);
    }
  };

  const plan = localPlan;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Edit plan – MyBodyScan" description="Update your active plan." />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" className="w-fit" onClick={() => nav("/programs")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Plans
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void endPlan("paused")}
              disabled={savingOp}
            >
              Pause
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void endPlan("ended")}
              disabled={savingOp}
            >
              End plan
            </Button>
          </div>
        </div>

        {planQuery.isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading plan…
            </CardContent>
          </Card>
        ) : !plan ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No active plan found. Choose a plan to start.
            </CardContent>
          </Card>
        ) : (
          <Card className="border bg-card/60">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-semibold">
                {plan.title || "Active plan"}
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Edit exercises, sets/reps, and re-order workouts. Changes save instantly.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.isArray(plan.days) &&
                plan.days.map((day: any, dayIndex: number) => (
                  <Card key={`${day.day}-${dayIndex}`} className="border bg-background/60">
                    <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">
                          Workout day
                        </div>
                        <div className="text-lg font-semibold">{day.day}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {DAYS.map((d) => (
                          <Button
                            key={d}
                            type="button"
                            size="sm"
                            variant={day.day === d ? "default" : "outline"}
                            onClick={() => {
                              setDayNameLocal(dayIndex, d);
                              void runOp({ type: "set_day_name", dayIndex, day: d });
                            }}
                            disabled={savingOp || (usedDays.has(d) && day.day !== d)}
                          >
                            {d}
                          </Button>
                        ))}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(day.exercises ?? []).map((ex: any, exIdx: number) => (
                        <div key={`${ex.id || exIdx}`} className="rounded-md border p-3">
                          <div className="grid gap-3 md:grid-cols-[1fr_90px_120px_auto] md:items-end">
                            <div className="space-y-1">
                              <Label className="text-xs">Exercise</Label>
                              <Input
                                value={ex.name ?? ""}
                                onChange={(e) => updateExerciseLocal(dayIndex, exIdx, { name: e.target.value })}
                                onBlur={(e) =>
                                  void runOp({
                                    type: "update_exercise",
                                    dayIndex,
                                    exerciseIndex: exIdx,
                                    name: e.target.value,
                                  })
                                }
                                disabled={savingOp}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Sets</Label>
                              <Input
                                type="number"
                                min={1}
                                max={10}
                                value={Number(ex.sets ?? 3)}
                                onChange={(e) =>
                                  updateExerciseLocal(dayIndex, exIdx, { sets: Number(e.target.value) })
                                }
                                onBlur={(e) =>
                                  void runOp({
                                    type: "update_exercise",
                                    dayIndex,
                                    exerciseIndex: exIdx,
                                    sets: Number(e.target.value),
                                  })
                                }
                                disabled={savingOp}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Reps</Label>
                              <Input
                                value={String(ex.reps ?? "")}
                                onChange={(e) => updateExerciseLocal(dayIndex, exIdx, { reps: e.target.value })}
                                onBlur={(e) =>
                                  void runOp({
                                    type: "update_exercise",
                                    dayIndex,
                                    exerciseIndex: exIdx,
                                    reps: e.target.value,
                                  })
                                }
                                disabled={savingOp}
                              />
                            </div>
                            <div className="flex flex-wrap gap-2 md:justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  reorderExerciseLocal(dayIndex, exIdx, exIdx - 1);
                                  void runOp({
                                    type: "reorder_exercise",
                                    dayIndex,
                                    fromIndex: exIdx,
                                    toIndex: exIdx - 1,
                                  });
                                }}
                                disabled={savingOp || exIdx === 0}
                              >
                                Up
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  reorderExerciseLocal(dayIndex, exIdx, exIdx + 1);
                                  void runOp({
                                    type: "reorder_exercise",
                                    dayIndex,
                                    fromIndex: exIdx,
                                    toIndex: exIdx + 1,
                                  });
                                }}
                                disabled={savingOp || exIdx === (day.exercises?.length ?? 1) - 1}
                              >
                                Down
                              </Button>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Move to</span>
                                <div className="flex flex-wrap gap-2">
                                  {(plan.days ?? []).map((d2: any, idx2: number) => (
                                    <Button
                                      key={`${d2.day}-${idx2}`}
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        moveExerciseToDayLocal(dayIndex, exIdx, idx2);
                                        void runOp({
                                          type: "move_exercise",
                                          fromDayIndex: dayIndex,
                                          fromIndex: exIdx,
                                          toDayIndex: idx2,
                                          toIndex: Number.isFinite(plan.days?.[idx2]?.exercises?.length)
                                            ? plan.days[idx2].exercises.length
                                            : 0,
                                        });
                                      }}
                                      disabled={savingOp || idx2 === dayIndex}
                                    >
                                      {d2.day}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      <div className="text-xs text-muted-foreground">
                        <Save className="mr-1 inline-block h-3 w-3" />
                        {savingOp ? "Saving…" : "Saved"}
                      </div>
                    </CardContent>
                  </Card>
                ))}
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

