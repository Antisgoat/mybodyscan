import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Info } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { loadAllPrograms, type CatalogEntry, type ProgramMeta } from "@/lib/coach/catalog";
import type { Exercise, Program, ProgramEquipment, ProgramFaq } from "@/lib/coach/types";
import { isDeloadWeek } from "@/lib/coach/progression";
import { auth, db } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoToast } from "@/lib/demoToast";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { applyCatalogPlan, type CatalogPlanSubmission } from "@/lib/workouts";

const equipmentLabels: Record<ProgramEquipment, string> = {
  none: "Bodyweight",
  dumbbells: "Dumbbells",
  kettlebells: "Kettlebells",
  barbell: "Barbell",
  machines: "Machines",
  bands: "Bands",
};

const goalLabels: Record<Program["goal"], string> = {
  hypertrophy: "Hypertrophy",
  strength: "Strength",
  cut: "Cut / Recomp",
  general: "General Fitness",
};

const levelLabels = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function formatDuration(minutes: number | undefined) {
  if (!minutes) return "~45 min";
  if (minutes % 15 === 0) return `${minutes} min sessions`;
  return `~${minutes} min sessions`;
}

function firstTrainingDay(program: Program) {
  for (const week of program.weeks) {
    const day = week.days?.[0];
    if (day) return day;
  }
  return program.weeks[0]?.days?.[0];
}

function describeExercise(exercise: Exercise) {
  const parts: string[] = [];
  if (typeof exercise.sets === "number" && exercise.sets > 0) {
    parts.push(`${exercise.sets} sets`);
  }
  if (exercise.reps) {
    parts.push(`${exercise.reps}`);
  }
  if (typeof exercise.restSec === "number" && exercise.restSec > 0) {
    parts.push(`${exercise.restSec}s rest`);
  }
  return parts.length ? `${exercise.name} — ${parts.join(" · ")}` : exercise.name;
}

export default function ProgramDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [entry, setEntry] = useState<CatalogEntry | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const demo = useDemoMode();

  useEffect(() => {
    let mounted = true;
    loadAllPrograms()
      .then((items) => {
        if (!mounted) return;
        const match = items.find((item) => item.meta.id === id);
        setEntry(match ?? null);
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [id]);

  const program = entry?.program;
  const meta = entry?.meta;

  const sampleDay = useMemo(() => (program ? firstTrainingDay(program) : null), [program]);

  const handleStartProgram = async () => {
    if (!program || !meta) return;
    if (demo) {
      demoToast();
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to save your training program." });
      return;
    }
    try {
      setIsSaving(true);
      const profileRef = doc(db, "users", user.uid, "coach", "profile");
      const planRef = doc(db, "users", user.uid, "coachPlans", "current");
      const priorPlanSnap = await getDoc(planRef);
      const priorPlan = priorPlanSnap.exists() ? (priorPlanSnap.data() as Record<string, any>) : null;

      const sessions = program.weeks.flatMap((week, weekIdx) =>
        (week.days ?? []).map((day) => ({
          day: `Week ${weekIdx + 1} • ${day.name}`,
          blocks: day.blocks.map((block) => ({
            title: block.title,
            focus: block.title,
            work: block.exercises.map((exercise) => describeExercise(exercise)),
          })),
        })),
      );

      const catalogSubmission = buildCatalogPlanSubmission(program, meta);
      let workoutPlanId: string | null = null;
      try {
        const applied = await applyCatalogPlan(catalogSubmission);
        workoutPlanId = typeof applied?.planId === "string" ? applied.planId : null;
      } catch (error: any) {
        throw new Error(
          typeof error?.message === "string" && error.message.length
            ? error.message
            : "Unable to apply the workout plan. Please try again.",
        );
      }
      if (!workoutPlanId) {
        throw new Error("Unable to activate workout plan.");
      }

      const fallbackCalorieTarget = typeof priorPlan?.calorieTarget === "number" ? priorPlan.calorieTarget : 2200;
      const fallbackProteinFloor = typeof priorPlan?.proteinFloor === "number" ? priorPlan.proteinFloor : 140;
      const progression =
        priorPlan?.progression ??
        ({ deloadEvery: Array.isArray(program.deloadWeeks) && program.deloadWeeks.length ? program.deloadWeeks[0] : 4 } as {
          deloadEvery: number;
        });

      const nextPlan = {
        days: meta.daysPerWeek,
        weeks: meta.weeks,
        split: program.title,
        sessions,
        progression,
        calorieTarget: fallbackCalorieTarget,
        proteinFloor: fallbackProteinFloor,
        disclaimer: program.summary ?? priorPlan?.disclaimer ?? "Training guidance only – not medical advice.",
        source: "catalog",
        programId: program.id,
        programTitle: program.title,
        programGoal: meta.goal,
        programLevel: meta.level,
        workoutPlanId,
        updatedAt: serverTimestamp(),
      };

      await setDoc(planRef, nextPlan, { merge: true });
      // FIX: Mirror the selected catalog program into the coach profile so downstream tabs immediately show the active plan.
      await setDoc(
        profileRef,
        {
          currentProgramId: program.id,
          activeProgramId: program.id,
          startedAt: serverTimestamp(),
          currentWeekIdx: 0,
          currentDayIdx: 0,
          lastCompletedWeekIdx: -1,
          lastCompletedDayIdx: -1,
        },
        { merge: true },
      );
      toast({ title: "Program started", description: `${program.title} is now your active plan.` });
      navigate("/coach", { replace: true });
    } catch (error) {
      const code = typeof (error as { code?: string } | null)?.code === "string" ? (error as { code: string }).code : null;
      let description: string;
      if (code === "permission-denied") {
        description = "Your account can't start programs yet. Refresh or contact support.";
      } else if (code === "unavailable") {
        description = "Programs are temporarily offline. Please try again shortly.";
      } else if (typeof (error as Error)?.message === "string" && (error as Error).message.length) {
        description = (error as Error).message;
      } else {
        description = "Please try again.";
      }
      toast({
        title: "Could not start program",
        description,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreview = () => {
    if (!program) return;
    navigate(`/coach/day?programId=${program.id}&week=0&day=0`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <Seo title="Programs – MyBodyScan" description="Browse structured training programs." />
        <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
          <div className="h-64 animate-pulse rounded-lg bg-muted/50" />
          <div className="space-y-4">
            <div className="h-10 w-1/2 animate-pulse rounded bg-muted/40" />
            <div className="h-32 animate-pulse rounded bg-muted/40" />
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!entry || !program || !meta) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <Seo title="Program not found – MyBodyScan" description="Program details." />
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
          <Button variant="ghost" className="w-fit" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to programs
          </Button>
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              We couldn't find that program. Browse the catalog to pick another option.
            </CardContent>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  const equipment = meta.equipment.length ? meta.equipment : ["none"];
  const equipmentDisplay = equipment.map((item) => equipmentLabels[item] ?? item);
  const deloadWeeks = program.deloadWeeks ?? [];
  const hasDeloadWeeks = deloadWeeks.length > 0;
  const deloadWeekLabel = deloadWeeks
    .map((week) => (Number.isFinite(week) ? `Week ${week}` : null))
    .filter(Boolean)
    .join(", ");
  const sessionLengthLabel = meta.durationPerSessionMin
    ? `${meta.durationPerSessionMin} min`
    : "~45 min";
  const scheduleCaption = `${meta.daysPerWeek} d/wk • ${meta.weeks} week${meta.weeks === 1 ? "" : "s"} • ${sessionLengthLabel}`;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title={`${program.title} – MyBodyScan`} description={program.summary ?? "Training program details"} />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
        <Button variant="ghost" className="w-fit" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to programs
        </Button>

        <Card className="overflow-hidden border bg-card/60">
          <div className="relative">
            <AspectRatio ratio={16 / 7}>
              <div className="relative h-full w-full">
                {meta.heroImg ? (
                  <img src={meta.heroImg} alt={program.title} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-primary/30 via-primary/10 to-background" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                <div className="absolute bottom-4 left-4 flex flex-wrap gap-2 text-xs font-semibold text-foreground">
                  <span className="rounded-full bg-background/80 px-3 py-1 shadow-sm backdrop-blur-sm">
                    {goalLabels[program.goal]}
                  </span>
                  <span className="rounded-full bg-background/70 px-3 py-1 shadow-sm backdrop-blur-sm">
                    {levelLabels[meta.level]}
                  </span>
                </div>
              </div>
            </AspectRatio>
          </div>
          <CardHeader className="space-y-4">
            <div className="space-y-2">
              <CardTitle className="text-3xl font-semibold">{program.title}</CardTitle>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {program.summary ?? `A ${meta.daysPerWeek}-day plan for ${levelLabels[meta.level]}.`}
              </p>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{scheduleCaption}</p>
            {program.tags && program.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {program.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </CardHeader>
        </Card>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="border bg-card/60">
            <CardHeader>
              <CardTitle className="text-xl">What you’ll do</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                {program.description ??
                  program.summary ??
                  `Follow ${meta.daysPerWeek} structured sessions each week focused on ${goalLabels[meta.goal].toLowerCase()}.`}
              </p>
              {program.rationale && (
                <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                    Why this plan works
                  </span>
                  <p className="text-sm leading-relaxed text-muted-foreground">{program.rationale}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border bg-card/60">
            <CardHeader>
              <CardTitle className="text-xl">At a glance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="grid gap-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Level</dt>
                  <dd className="font-medium text-foreground">{levelLabels[meta.level]}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Days / week</dt>
                  <dd className="font-medium text-foreground">{meta.daysPerWeek}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Total weeks</dt>
                  <dd className="font-medium text-foreground">{meta.weeks}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Session length</dt>
                  <dd className="font-medium text-foreground">{formatDuration(meta.durationPerSessionMin)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">Equipment</dt>
                  <dd className="font-medium text-foreground">{equipmentDisplay.join(" • ")}</dd>
                </div>
              </dl>
              {hasDeloadWeeks && deloadWeekLabel && (
                <p className="text-xs text-muted-foreground">Includes deload week(s): {deloadWeekLabel}</p>
              )}
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="border bg-card/60">
            <CardHeader>
              <CardTitle className="text-xl">Weekly schedule overview</CardTitle>
            </CardHeader>
            <CardContent>
              {hasDeloadWeeks && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Deload weeks automatically dial back volume so you can recover before the next block.
                </p>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Week</TableHead>
                    <TableHead>Training Days</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {program.weeks.map((week, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>Week {index + 1}</span>
                          {isDeloadWeek(index, program.deloadWeeks) && (
                            <Badge variant="outline" className="border-primary/40 text-primary">
                              Deload
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {week.days.map((day) => day.name).join(" • ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border bg-card/60">
            <CardHeader>
              <CardTitle className="text-xl">Required equipment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You’ll primarily need:
              </p>
              <div className="flex flex-wrap gap-2">
                {equipment.map((item) => (
                  <Badge key={item} variant="outline" className="capitalize">
                    {equipmentLabels[item] ?? item}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Swap accessories as needed to match your gym setup.
              </p>
            </CardContent>
          </Card>
        </section>

        <Card className="border bg-card/60">
          <CardHeader>
            <CardTitle className="text-xl">Sample training day</CardTitle>
          </CardHeader>
          <CardContent>
            {sampleDay ? (
              <Accordion type="single" collapsible defaultValue="day-1">
                <AccordionItem value="day-1">
                  <AccordionTrigger className="text-left text-base font-medium">
                    {sampleDay.name}
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4">
                    {sampleDay.blocks.map((block, blockIdx) => (
                      <div key={blockIdx} className="rounded-md border bg-muted/40 p-4">
                        <p className="text-sm font-semibold text-foreground">{block.title}</p>
                        <Separator className="my-2" />
                        <ul className="space-y-2 text-sm text-muted-foreground">
                          {block.exercises.map((exercise, exerciseIdx) => (
                            <li key={exerciseIdx} className="flex items-start justify-between gap-4">
                              <span>{exercise.name}</span>
                              <span className="text-xs uppercase tracking-wide">
                                {exercise.sets} × {exercise.reps}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ) : (
              <p className="text-sm text-muted-foreground">No training days provided.</p>
            )}
          </CardContent>
        </Card>

        {program.faqs && program.faqs.length > 0 && (
          <Card className="border bg-card/60">
            <CardHeader>
              <CardTitle className="text-xl">FAQs</CardTitle>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible>
                {program.faqs.map((faq: ProgramFaq, index) => (
                  <AccordionItem key={index} value={`faq-${index}`}>
                    <AccordionTrigger className="text-left text-sm font-medium">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}

        <Card className="border bg-card/60">
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Info className="mt-1 h-5 w-5 text-primary" />
              <p className="text-sm text-muted-foreground">
                Starting this program keeps your past logs intact and resets your weekly schedule to week 1.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button size="sm" variant="outline" onClick={handlePreview}>
                Preview week 1
              </Button>
              <DemoWriteButton
                size="sm"
                onClick={handleStartProgram}
                disabled={isSaving || demo}
                title={demo ? "Demo mode: sign in to save" : undefined}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> {demo ? "Demo only" : "Start program"}
              </DemoWriteButton>
            </div>
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}

const DAY_NAME_PRESETS: Record<number, string[]> = {
  1: ["Mon"],
  2: ["Mon", "Thu"],
  3: ["Mon", "Wed", "Fri"],
  4: ["Mon", "Tue", "Thu", "Fri"],
  5: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  6: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  7: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
};

function pickWeekdays(count: number): string[] {
  const clamped = Math.max(1, Math.min(count, 7));
  return DAY_NAME_PRESETS[clamped] ?? DAY_NAME_PRESETS[5];
}

function flattenExercises(day: Program["weeks"][number]["days"][number]): CatalogPlanSubmission["days"][number]["exercises"] {
  const exercises = day.blocks?.flatMap((block) => block.exercises || []) ?? [];
  if (!exercises.length) {
    return [
      {
        name: "Session",
        sets: 3,
        reps: "10",
      },
    ];
  }
  return exercises.slice(0, 12).map((exercise, index) => ({
    name: exercise.name || `Exercise ${index + 1}`,
    sets: Number.isFinite(exercise.sets) && exercise.sets > 0 ? exercise.sets : 3,
    reps: exercise.reps ?? "10",
  }));
}

function buildCatalogPlanSubmission(program: Program, meta: ProgramMeta): CatalogPlanSubmission {
  const baseWeek = program.weeks?.[0];
  const sourceDays = baseWeek?.days ?? [];
  if (!sourceDays.length) {
    throw new Error("Program days are missing a schedule.");
  }
  const weekdays = pickWeekdays(sourceDays.length);
  const days = sourceDays.slice(0, weekdays.length).map((day, index) => ({
    day: weekdays[index],
    exercises: flattenExercises(day),
  }));
  return {
    programId: program.id,
    title: program.title,
    goal: program.goal,
    level: meta.level,
    days,
  };
}
