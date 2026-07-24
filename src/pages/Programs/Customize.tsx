import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  activateCustomPlan,
  previewCustomPlan,
  type CatalogPlanDay,
  type CustomPlanFocus,
  type CustomPlanGoal,
  type CustomPlanPrefs,
  type CustomPlanStyle,
  type CustomPlanExperience,
} from "@/lib/workouts";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { validateWorkoutPlanDays } from "@/lib/workoutsCustomValidation";
import type { Equipment, MovementPattern } from "@/data/exercises";
import {
  getExerciseByExactName,
  normalizeExerciseName,
  searchExercises,
} from "@/lib/exercises/library";

type DayName = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
const DAYS: DayName[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function allowedEquipmentFromPrefs(prefs: CustomPlanPrefs): {
  mode: "full_gym" | "minimal";
  allowed: Set<Equipment>;
} {
  const eq = new Set((prefs.equipment ?? []).map((s) => String(s).toLowerCase()));
  const minimal =
    prefs.trainingStyle === "minimal_equipment" ||
    (!eq.has("gym") && (eq.has("dumbbells") || eq.has("bodyweight")));
  if (minimal) {
    return { mode: "minimal", allowed: new Set<Equipment>(["dumbbell", "bodyweight"]) };
  }
  return {
    mode: "full_gym",
    allowed: new Set<Equipment>([
      "barbell",
      "dumbbell",
      "machine",
      "cables",
      "smith",
      "bodyweight",
      "kettlebell",
    ]),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function ensureUniqueDays(days: DayName[], fallbackCount: number): DayName[] {
  const out: DayName[] = [];
  for (const d of days) {
    if (!out.includes(d)) out.push(d);
  }
  if (out.length >= fallbackCount) return out.slice(0, fallbackCount);
  for (const d of DAYS) {
    if (!out.includes(d)) out.push(d);
    if (out.length >= fallbackCount) break;
  }
  return out.slice(0, fallbackCount);
}

function normalizeDaysPerWeek(value: number) {
  return clamp(Math.round(value), 2, 6);
}

export default function CustomizeProgram() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const fromActive = searchParams.get("fromActive") === "1";

  const [goal, setGoal] = useState<CustomPlanGoal>("build_muscle");
  const [experience, setExperience] = useState<CustomPlanExperience>("beginner");
  const [trainingStyle, setTrainingStyle] = useState<CustomPlanStyle>("balanced");
  const [focus, setFocus] = useState<CustomPlanFocus>("full_body");
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);
  const [preferredDays, setPreferredDays] = useState<DayName[]>(["Mon", "Tue", "Thu", "Fri"]);
  const [timePerWorkout, setTimePerWorkout] = useState<CustomPlanPrefs["timePerWorkout"]>("45");
  const [equipment, setEquipment] = useState<string[]>(["bodyweight"]);
  const [emphasis, setEmphasis] = useState<string[]>([]);
  const [injuries, setInjuries] = useState<string>("");
  const [avoidExercises, setAvoidExercises] = useState<string>("");
  const [cardioPreference, setCardioPreference] = useState<string>("none");

  const [title, setTitle] = useState<string>("My custom plan");
  const [generatedDays, setGeneratedDays] = useState<CatalogPlanDay[] | null>(null);
  const [generating, setGenerating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [generationVariant, setGenerationVariant] = useState<number>(0);
  const [swapTarget, setSwapTarget] = useState<{ dayIndex: number; exerciseIndex: number } | null>(null);
  const [swapQuery, setSwapQuery] = useState<string>("");

  const prefs: CustomPlanPrefs = useMemo(
    () => ({
      goal,
      experience,
      trainingStyle,
      focus,
      daysPerWeek,
      preferredDays: preferredDays.slice(0, daysPerWeek),
      timePerWorkout,
      equipment,
      emphasis,
      injuries: injuries.trim() ? injuries.trim() : null,
      avoidExercises: avoidExercises.trim() ? avoidExercises.trim() : null,
      cardioPreference: cardioPreference.trim() ? cardioPreference.trim() : null,
    }),
    [
      goal,
      experience,
      trainingStyle,
      focus,
      daysPerWeek,
      preferredDays,
      timePerWorkout,
      equipment,
      emphasis,
      injuries,
      avoidExercises,
      cardioPreference,
    ]
  );

  const swapContext = useMemo(() => {
    if (!swapTarget || !generatedDays) return null;
    const day = generatedDays[swapTarget.dayIndex];
    const ex = day?.exercises?.[swapTarget.exerciseIndex];
    const currentName = typeof ex?.name === "string" ? ex.name : "";
    const inferred = currentName ? getExerciseByExactName(currentName) : null;
    const inferredPattern: MovementPattern | null = inferred?.movementPattern ?? null;
    const inferredTags = inferred?.tags ?? [];
    const equip = allowedEquipmentFromPrefs(prefs);
    return {
      currentName,
      inferredPattern,
      inferredTags,
      allowedEquipment: equip.allowed,
      mode: equip.mode,
      excludeId: inferred?.id ?? null,
    };
  }, [generatedDays, prefs, swapTarget]);

  const swapResults = useMemo(() => {
    if (!swapContext) return [];
    const excludeIds = new Set<string>();
    if (swapContext.excludeId) excludeIds.add(swapContext.excludeId);

    // If we can infer a pattern, restrict to that to keep Swap meaningful.
    const movementPattern = swapContext.inferredPattern;

    // If the current exercise is an isolation (arms/delts), keep it relevant by using tags.
    const tagsForSwap = (() => {
      const t = new Set(swapContext.inferredTags.map((x) => x.toLowerCase()));
      if (t.has("biceps")) return ["biceps"];
      if (t.has("triceps")) return ["triceps"];
      if (t.has("lateral_delts")) return ["lateral_delts"];
      if (t.has("rear_delts")) return ["rear_delts"];
      if (t.has("calves")) return ["calves"];
      if (t.has("hamstrings")) return ["hamstrings"];
      if (t.has("quads")) return ["quads"];
      return [];
    })();

    const q = swapQuery.trim();
    const candidates = searchExercises({
      query: q,
      movementPattern,
      includeTags: tagsForSwap.length ? tagsForSwap : undefined,
      equipment: swapContext.allowedEquipment,
      mode: swapContext.mode,
      excludeIds,
      limit: 80,
    });

    // Keep a stable order when query is empty to feel deterministic.
    if (!q) {
      return candidates
        .slice()
        .sort((a, b) => normalizeExerciseName(a.name).localeCompare(normalizeExerciseName(b.name)))
        .slice(0, 30);
    }
    return candidates.slice(0, 30);
  }, [swapContext, swapQuery]);

  const preferredDaySet = useMemo(() => new Set(preferredDays), [preferredDays]);

  const togglePreferredDay = (day: DayName) => {
    setPreferredDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day];
      return ensureUniqueDays(next, normalizeDaysPerWeek(daysPerWeek));
    });
  };

  const toggleEquipment = (value: string) => {
    setEquipment((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const toggleEmphasis = (value: string) => {
    setEmphasis((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const safeDaysPerWeek = normalizeDaysPerWeek(daysPerWeek);
      const safePreferred = ensureUniqueDays(preferredDays, safeDaysPerWeek);
      const nextVariant = generationVariant + 1;
      setGenerationVariant(nextVariant);
      const res = await previewCustomPlan({
        prefs: {
          ...prefs,
          daysPerWeek: safeDaysPerWeek,
          preferredDays: safePreferred,
        },
        title: title.trim() ? title.trim() : undefined,
        variant: nextVariant,
      });
      setTitle(res.title);
      const days = Array.isArray(res.days) ? res.days : [];
      setGeneratedDays(days);
      toast({ title: "Plan generated", description: "Review and customize before starting." });
    } catch (err: any) {
      toast({
        title: "Unable to generate",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  const updateExercise = (dayIndex: number, exerciseIndex: number, patch: Partial<{ name: string; sets: number; reps: string }>) => {
    setGeneratedDays((prev) => {
      if (!prev) return prev;
      const days = prev.map((d) => ({ ...d, exercises: [...d.exercises] }));
      const day = days[dayIndex];
      if (!day) return prev;
      const ex = day.exercises[exerciseIndex];
      if (!ex) return prev;
      day.exercises[exerciseIndex] = {
        ...ex,
        ...patch,
        sets: patch.sets === undefined ? ex.sets : clamp(patch.sets, 1, 10),
      };
      return days;
    });
  };

  const moveExercise = (dayIndex: number, fromIndex: number, toIndex: number) => {
    setGeneratedDays((prev) => {
      if (!prev) return prev;
      const days = prev.map((d) => ({ ...d, exercises: [...d.exercises] }));
      const day = days[dayIndex];
      if (!day) return prev;
      if (fromIndex < 0 || fromIndex >= day.exercises.length) return prev;
      const clampedTo = clamp(toIndex, 0, day.exercises.length - 1);
      const [item] = day.exercises.splice(fromIndex, 1);
      day.exercises.splice(clampedTo, 0, item);
      return days;
    });
  };

  const moveExerciseToDay = (fromDayIndex: number, exerciseIndex: number, toDayIndex: number) => {
    setGeneratedDays((prev) => {
      if (!prev) return prev;
      const days = prev.map((d) => ({ ...d, exercises: [...d.exercises] }));
      const fromDay = days[fromDayIndex];
      const toDay = days[toDayIndex];
      if (!fromDay || !toDay) return prev;
      const [item] = fromDay.exercises.splice(exerciseIndex, 1);
      if (!item) return prev;
      toDay.exercises.push(item);
      return days;
    });
  };

  const setDayName = (dayIndex: number, day: DayName) => {
    setGeneratedDays((prev) => {
      if (!prev) return prev;
      const used = new Set(prev.map((d) => d.day));
      const current = prev[dayIndex]?.day;
      if (current) used.delete(current);
      if (used.has(day)) {
        toast({ title: "Day already used", description: "Pick a different day." });
        return prev;
      }
      const days = prev.map((d) => ({ ...d, exercises: [...d.exercises] }));
      if (!days[dayIndex]) return prev;
      days[dayIndex] = { ...days[dayIndex]!, day };
      return days;
    });
  };

  const handleStart = async () => {
    if (!generatedDays) {
      toast({ title: "Generate a plan first" });
      return;
    }
    const validationError = validateWorkoutPlanDays(generatedDays);
    if (validationError) {
      toast({ title: "Fix plan issues", description: validationError, variant: "destructive" });
      return;
    }
    setStarting(true);
    try {
      const res = await activateCustomPlan({
        prefs,
        title: title.trim() ? title.trim() : undefined,
        goal: goal.replace(/_/g, " "),
        level: experience,
        days: generatedDays,
      });
      nav(`/workouts?plan=${res.planId}&started=1`, { replace: true });
    } catch (err: any) {
      toast({
        title: "Could not start plan",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Customize plan – MyBodyScan" description="Build a workout plan that fits you." />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            className="w-fit"
            onClick={() => (fromActive ? nav("/programs") : nav(-1))}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </div>

        <Card className="border bg-card/60">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary">
              <Sparkles className="h-4 w-4" /> Customize plan
            </div>
            <CardTitle className="text-3xl font-semibold">Build your plan</CardTitle>
            <p className="text-sm text-muted-foreground">
              A few choices, then a plan you can tweak before starting.
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="plan-title">Plan name</Label>
              <Input
                id="plan-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="My custom plan"
              />
            </div>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Goal</Label>
                <RadioGroup value={goal} onValueChange={(v) => setGoal(v as CustomPlanGoal)} className="grid gap-2">
                  {[
                    ["lose_fat", "Lose fat"],
                    ["build_muscle", "Build muscle"],
                    ["recomp", "Recomposition"],
                    ["performance", "Performance"],
                  ].map(([value, label]) => (
                    <Label key={value} className="flex cursor-pointer items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:border-primary">
                      <span className="font-medium">{label}</span>
                      <RadioGroupItem value={value} />
                    </Label>
                  ))}
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label>Experience</Label>
                <RadioGroup value={experience} onValueChange={(v) => setExperience(v as CustomPlanExperience)} className="grid gap-2">
                  {[
                    ["beginner", "Beginner"],
                    ["intermediate", "Intermediate"],
                    ["advanced", "Advanced"],
                  ].map(([value, label]) => (
                    <Label key={value} className="flex cursor-pointer items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:border-primary">
                      <span className="font-medium">{label}</span>
                      <RadioGroupItem value={value} />
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Training style</Label>
                <RadioGroup value={trainingStyle} onValueChange={(v) => setTrainingStyle(v as CustomPlanStyle)} className="grid gap-2">
                  {[
                    ["balanced", "Balanced"],
                    ["strength", "Strength"],
                    ["hypertrophy", "Hypertrophy"],
                    ["athletic", "Athletic"],
                    ["minimal_equipment", "Minimal equipment"],
                  ].map(([value, label]) => (
                    <Label key={value} className="flex cursor-pointer items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:border-primary">
                      <span className="font-medium">{label}</span>
                      <RadioGroupItem value={value} />
                    </Label>
                  ))}
                </RadioGroup>
              </div>
              <div className="space-y-2">
                <Label>Focus</Label>
                <RadioGroup value={focus} onValueChange={(v) => setFocus(v as CustomPlanFocus)} className="grid gap-2">
                  {[
                    ["full_body", "Full body"],
                    ["upper_lower", "Upper / Lower"],
                    ["push_pull_legs", "Push / Pull / Legs"],
                    ["bro_split", "Bro split"],
                    ["custom_emphasis", "Custom emphasis"],
                  ].map(([value, label]) => (
                    <Label key={value} className="flex cursor-pointer items-center justify-between rounded-md border bg-card px-4 py-3 text-sm hover:border-primary">
                      <span className="font-medium">{label}</span>
                      <RadioGroupItem value={value} />
                    </Label>
                  ))}
                </RadioGroup>
              </div>
            </section>

            <section className="space-y-2">
              <Label>Schedule</Label>
              <div className="grid gap-3 rounded-md border bg-muted/40 p-4 md:grid-cols-3">
                <label className="space-y-1 text-sm">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Days / week (2–6)
                  </span>
                  <Input
                    type="number"
                    min={2}
                    max={6}
                    step={1}
                    value={daysPerWeek}
                    onChange={(e) => {
                      const next = normalizeDaysPerWeek(Number(e.target.value));
                      setDaysPerWeek(next);
                      setPreferredDays((prev) => ensureUniqueDays(prev, next));
                    }}
                  />
                </label>
                <label className="space-y-1 text-sm">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Time / workout
                  </span>
                  <RadioGroup
                    value={timePerWorkout ?? "45"}
                    onValueChange={(v) => setTimePerWorkout(v as any)}
                    className="grid grid-cols-2 gap-2"
                  >
                    {["30", "45", "60", "75+"].map((v) => (
                      <Label key={v} className="flex cursor-pointer items-center justify-between rounded-md border bg-card px-3 py-2 text-sm hover:border-primary">
                        <span>{v === "75+" ? "75+" : `${v} min`}</span>
                        <RadioGroupItem value={v} />
                      </Label>
                    ))}
                  </RadioGroup>
                </label>
                <div className="space-y-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Preferred days
                  </span>
                  <div className="grid grid-cols-4 gap-2">
                    {DAYS.map((d) => (
                      <Label
                        key={d}
                        className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-2 py-2 text-xs hover:border-primary"
                      >
                        <Checkbox checked={preferredDaySet.has(d)} onCheckedChange={() => togglePreferredDay(d)} />
                        <span>{d}</span>
                      </Label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    We’ll pick {daysPerWeek} unique days.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <Label>Equipment</Label>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={equipment.includes("gym") ? "default" : "outline"}
                  onClick={() => {
                    setEquipment(["gym"]);
                    if (trainingStyle === "minimal_equipment") {
                      setTrainingStyle("balanced");
                    }
                  }}
                >
                  Full gym
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={
                    equipment.includes("dumbbells") && equipment.includes("bodyweight")
                      ? "default"
                      : "outline"
                  }
                  onClick={() => {
                    setEquipment(["dumbbells", "bodyweight"]);
                    setTrainingStyle("minimal_equipment");
                  }}
                >
                  Minimal equipment
                </Button>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {[
                  ["bodyweight", "Bodyweight"],
                  ["dumbbells", "Dumbbells"],
                  ["bands", "Bands"],
                  ["gym", "Full gym"],
                ].map(([value, label]) => (
                  <Label
                    key={value}
                    className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:border-primary"
                  >
                    <Checkbox checked={equipment.includes(value)} onCheckedChange={() => toggleEquipment(value)} />
                    <span>{label}</span>
                  </Label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Select anything you have access to.
              </p>
            </section>

            <section className="space-y-2">
              <Label>Focus areas (optional)</Label>
              <div className="flex flex-wrap gap-2">
                {["chest", "back", "legs", "glutes", "shoulders", "arms", "core"].map((v) => (
                  <Button
                    key={v}
                    type="button"
                    size="sm"
                    variant={emphasis.includes(v) ? "default" : "outline"}
                    onClick={() => toggleEmphasis(v)}
                  >
                    {v}
                  </Button>
                ))}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="injuries">Injuries / limitations</Label>
                <Textarea
                  id="injuries"
                  value={injuries}
                  onChange={(e) => setInjuries(e.target.value)}
                  placeholder="Knee pain, shoulder limitations…"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avoid">Avoid exercises (optional)</Label>
                <Textarea
                  id="avoid"
                  value={avoidExercises}
                  onChange={(e) => setAvoidExercises(e.target.value)}
                  placeholder="No running, no overhead press…"
                  rows={3}
                />
              </div>
            </section>

            <section className="space-y-2">
              <Label>Cardio frequency</Label>
              <RadioGroup
                value={cardioPreference}
                onValueChange={(v) => setCardioPreference(v)}
                className="grid gap-2 sm:grid-cols-2"
              >
                {[
                  ["none", "None"],
                  ["1x", "1x / week"],
                  ["2x", "2x / week"],
                  ["3x", "3x / week"],
                ].map(([value, label]) => (
                  <Label
                    key={value}
                    className="flex cursor-pointer items-center justify-between rounded-md border bg-card px-3 py-2 text-sm hover:border-primary"
                  >
                    <span>{label}</span>
                    <RadioGroupItem value={value} />
                  </Label>
                ))}
              </RadioGroup>
            </section>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button type="button" variant="outline" onClick={() => setGeneratedDays(null)} disabled={!generatedDays}>
                Reset preview
              </Button>
              <Button type="button" onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                  </span>
                ) : (
                  "Generate plan"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {generatedDays && (
          <Card className="border bg-card/60">
            <CardHeader className="space-y-1">
              <CardTitle className="text-xl">Preview & edit</CardTitle>
              <p className="text-sm text-muted-foreground">
                Swap movements, change sets/reps, and reorder before you start.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {generatedDays.map((day, dayIndex) => (
                <Card key={`${day.day}-${dayIndex}`} className="border bg-background/60">
                  <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Workout day
                      </div>
                      <div className="text-lg font-semibold text-foreground">{day.day}</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {DAYS.map((d) => (
                        <Button
                          key={d}
                          type="button"
                          size="sm"
                          variant={day.day === d ? "default" : "outline"}
                          onClick={() => setDayName(dayIndex, d)}
                        >
                          {d}
                        </Button>
                      ))}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {day.exercises.map((ex, exIdx) => (
                      <div key={`${ex.name}-${exIdx}`} className="rounded-md border p-3">
                        <div className="grid gap-3 md:grid-cols-[1fr_90px_120px_auto] md:items-end">
                          <div className="space-y-1">
                            <Label className="text-xs">Exercise</Label>
                            <Input
                              value={ex.name}
                              onChange={(e) => updateExercise(dayIndex, exIdx, { name: e.target.value })}
                            />
                            <div className="pt-2">
                              <Dialog
                                open={swapTarget?.dayIndex === dayIndex && swapTarget?.exerciseIndex === exIdx}
                                onOpenChange={(open) => {
                                  if (!open) {
                                    setSwapTarget(null);
                                    setSwapQuery("");
                                  } else {
                                    setSwapTarget({ dayIndex, exerciseIndex: exIdx });
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setSwapTarget({ dayIndex, exerciseIndex: exIdx });
                                      setSwapQuery("");
                                    }}
                                  >
                                    Swap (search)
                                  </Button>
                                </DialogTrigger>
                                <DialogContent className="max-w-lg" aria-describedby={undefined}>
                                  <DialogHeader>
                                    <DialogTitle>Swap exercise</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-3">
                                    <Input
                                      value={swapQuery}
                                      onChange={(e) => setSwapQuery(e.target.value)}
                                      placeholder="Search (e.g. bench, row, squat)…"
                                      autoFocus
                                    />
                                    <div className="max-h-72 overflow-auto rounded-md border">
                                      {swapResults.map((exercise) => (
                                          <button
                                            key={exercise.id}
                                            type="button"
                                            className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm hover:bg-muted"
                                            onClick={() => {
                                              updateExercise(dayIndex, exIdx, {
                                                name: exercise.name,
                                              });
                                              setSwapTarget(null);
                                              setSwapQuery("");
                                              toast({ title: "Exercise updated" });
                                            }}
                                          >
                                            <span className="font-medium">{exercise.name}</span>
                                            <span className="text-xs text-muted-foreground">Select</span>
                                          </button>
                                        ))}
                                      {!swapResults.length ? (
                                        <div className="p-3 text-sm text-muted-foreground">No exercises available.</div>
                                      ) : null}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      Tip: you can always type a custom name directly in the exercise field.
                                    </p>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Sets</Label>
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              value={Number(ex.sets ?? 3)}
                              onChange={(e) =>
                                updateExercise(dayIndex, exIdx, { sets: Number(e.target.value) })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Reps</Label>
                            <Input
                              value={String(ex.reps ?? "10")}
                              onChange={(e) => updateExercise(dayIndex, exIdx, { reps: e.target.value })}
                            />
                          </div>
                          <div className="flex flex-wrap gap-2 md:justify-end">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => moveExercise(dayIndex, exIdx, exIdx - 1)}
                              disabled={exIdx === 0}
                            >
                              Up
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => moveExercise(dayIndex, exIdx, exIdx + 1)}
                              disabled={exIdx === day.exercises.length - 1}
                            >
                              Down
                            </Button>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Move to</span>
                              <div className="flex flex-wrap gap-2">
                                {generatedDays.map((d, idx) => (
                                  <Button
                                    key={`${d.day}-${idx}`}
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => moveExerciseToDay(dayIndex, exIdx, idx)}
                                    disabled={idx === dayIndex}
                                  >
                                    {d.day}
                                  </Button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  When you start, we’ll send you straight to Today with the workout ready.
                </p>
                <DemoWriteButton onClick={handleStart} disabled={starting}>
                  {starting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Starting…
                    </span>
                  ) : (
                    "Start plan"
                  )}
                </DemoWriteButton>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}

