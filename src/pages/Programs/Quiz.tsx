import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, ChevronRight, CheckCircle2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { loadAllPrograms, matchScore, type CatalogEntry } from "@/lib/coach/catalog";
import type { ProgramEquipment, ProgramGoal, ProgramLevel } from "@/lib/coach/types";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "@/hooks/use-toast";

const goalOptions: Array<{ value: ProgramGoal; label: string; description: string }> = [
  { value: "hypertrophy", label: "Build muscle", description: "Hypertrophy-focused growth" },
  { value: "strength", label: "Get stronger", description: "Prioritize heavier compounds" },
  { value: "cut", label: "Lean out", description: "Maintain muscle while cutting" },
  { value: "general", label: "Stay balanced", description: "General fitness and training" },
];

const levelOptions: Array<{ value: ProgramLevel; label: string; description: string }> = [
  { value: "beginner", label: "New lifter", description: "Under 1 year of training" },
  { value: "intermediate", label: "Intermediate", description: "1-3 years under the bar" },
  { value: "advanced", label: "Advanced", description: "3+ years with structured training" },
];

const equipmentOptions: Array<{ value: ProgramEquipment; label: string }> = [
  { value: "none", label: "Bodyweight" },
  { value: "dumbbells", label: "Dumbbells" },
  { value: "kettlebells", label: "Kettlebells" },
  { value: "barbell", label: "Barbell" },
  { value: "machines", label: "Machines" },
  { value: "bands", label: "Bands" },
];

type QuizResult = {
  entry: CatalogEntry;
  score: number;
  reasons: string[];
};

export default function ProgramsQuiz() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [goal, setGoal] = useState<ProgramGoal>("hypertrophy");
  const [level, setLevel] = useState<ProgramLevel>("beginner");
  const [daysPerWeek, setDaysPerWeek] = useState<number>(4);
  const [ownedEquipment, setOwnedEquipment] = useState<ProgramEquipment[]>([]);
  const [sessionTime, setSessionTime] = useState<number>(45);
  const [results, setResults] = useState<QuizResult[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadAllPrograms()
      .then((items) => {
        if (!mounted) return;
        setEntries(items);
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const toggleEquipment = (value: ProgramEquipment) => {
    setOwnedEquipment((prev) =>
      prev.includes(value) ? prev.filter((item) => item !== value) : [...prev, value]
    );
  };

  const computeReasons = (entry: CatalogEntry, score: number): string[] => {
    const reasons: string[] = [];
    const { meta } = entry;
    if (meta.goal === goal) reasons.push("Matches your goal");
    if (Math.abs(meta.daysPerWeek - daysPerWeek) <= 1) {
      reasons.push(`Fits your ${daysPerWeek}-day routine`);
    }
    if (meta.level === level) {
      reasons.push(`${levelOptions.find((item) => item.value === level)?.label} friendly`);
    }
    const required = meta.equipment.filter((item) => item !== "none");
    if (!required.length) {
      reasons.push("No equipment required");
    } else if (required.every((item) => ownedEquipment.includes(item))) {
      reasons.push("Uses equipment you already own");
    }
    if (meta.durationPerSessionMin <= sessionTime) {
      reasons.push("Stays within your time limit");
    }
    if (score >= 85 && !reasons.includes("High match score")) {
      reasons.push("High match score");
    }
    return reasons.slice(0, 3);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!entries.length) return;
    const ranked = entries
      .map((entry) => {
        const score = matchScore(entry.meta, {
          goal,
          level,
          days: daysPerWeek,
          equipment: ownedEquipment.length ? ownedEquipment : undefined,
          time: sessionTime,
        });
        return {
          entry,
          score,
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((item) => ({
        ...item,
        reasons: computeReasons(item.entry, item.score),
      }));
    setResults(ranked);
  };

  const topRecommendation = results?.[0] ?? null;

  const handleStartRecommended = async () => {
    if (!topRecommendation) return;
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "Sign in required", description: "Log in to save your program." });
      return;
    }
    try {
      setIsSaving(true);
      await setDoc(
        doc(db, "users", user.uid, "coach", "profile"),
        {
          currentProgramId: topRecommendation.entry.program.id,
          activeProgramId: topRecommendation.entry.program.id,
          startedAt: new Date().toISOString(),
          currentWeekIdx: 0,
          currentDayIdx: 0,
          lastCompletedWeekIdx: -1,
          lastCompletedDayIdx: -1,
        },
        { merge: true }
      );
      toast({
        title: "Program selected",
        description: `${topRecommendation.entry.program.title} is ready in Coach.`,
      });
      navigate("/coach", { replace: true });
    } catch (error) {
      toast({
        title: "Unable to start program",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Program quiz – MyBodyScan" description="Find the right training plan in under a minute." />
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <Card className="border bg-card/60">
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary">
              <Sparkles className="h-4 w-4" /> Quick quiz
            </div>
            <CardTitle className="text-3xl font-semibold">Find your next program</CardTitle>
            <p className="text-sm text-muted-foreground">
              Answer five questions and we’ll recommend the top three blocks for your goals.
            </p>
          </CardHeader>
          <CardContent>
            <form className="space-y-6" onSubmit={handleSubmit}>
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Goal</h2>
                <RadioGroup value={goal} onValueChange={(value) => setGoal(value as ProgramGoal)} className="grid gap-2 md:grid-cols-2">
                  {goalOptions.map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`goal-${option.value}`}
                      className="flex cursor-pointer flex-col gap-1 rounded-md border bg-card px-4 py-3 text-sm transition hover:border-primary"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-foreground">{option.label}</span>
                        <RadioGroupItem value={option.value} id={`goal-${option.value}`} />
                      </div>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Experience level</h2>
                <RadioGroup value={level} onValueChange={(value) => setLevel(value as ProgramLevel)} className="grid gap-2 md:grid-cols-3">
                  {levelOptions.map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`level-${option.value}`}
                      className="flex cursor-pointer flex-col gap-1 rounded-md border bg-card px-4 py-3 text-sm transition hover:border-primary"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-foreground">{option.label}</span>
                        <RadioGroupItem value={option.value} id={`level-${option.value}`} />
                      </div>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </Label>
                  ))}
                </RadioGroup>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Days per week</h2>
                <div className="space-y-3 rounded-md border bg-muted/40 px-4 py-5">
                  <Slider min={2} max={6} step={1} value={[daysPerWeek]} onValueChange={(value) => setDaysPerWeek(value[0] ?? 4)} />
                  <p className="text-xs text-muted-foreground">{daysPerWeek} training days (±1 wiggle room)</p>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Equipment you have</h2>
                <div className="grid gap-2 md:grid-cols-3">
                  {equipmentOptions.map((option) => (
                    <Label
                      key={option.value}
                      htmlFor={`equipment-${option.value}`}
                      className="flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm transition hover:border-primary"
                    >
                      <Checkbox
                        id={`equipment-${option.value}`}
                        checked={ownedEquipment.includes(option.value)}
                        onCheckedChange={() => toggleEquipment(option.value)}
                      />
                      <span>{option.label}</span>
                    </Label>
                  ))}
                </div>
                {ownedEquipment.length === 0 && (
                  <p className="text-xs text-muted-foreground">Select anything you can access, or leave blank for bodyweight only.</p>
                )}
              </section>

              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Time per session</h2>
                <div className="space-y-3 rounded-md border bg-muted/40 px-4 py-5">
                  <Slider min={20} max={75} step={5} value={[sessionTime]} onValueChange={(value) => setSessionTime(value[0] ?? 45)} />
                  <p className="text-xs text-muted-foreground">Up to {sessionTime} minutes each workout</p>
                </div>
              </section>

              <div className="flex items-center justify-between">
                <Button type="button" variant="ghost" onClick={() => setResults(null)} disabled={!results}>
                  Reset results
                </Button>
                <Button type="submit" disabled={isLoading}>
                  See my matches <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {results && (
          <Card className="border bg-card/60">
            <CardHeader>
              <CardTitle className="text-xl">Your top programs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {results.map((item, index) => (
                <div key={item.entry.meta.id} className="rounded-lg border bg-background/60 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-foreground">{item.entry.program.title}</h3>
                        {index === 0 && <Badge variant="secondary">Top pick</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">Match score: {item.score}%</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/programs/${item.entry.meta.id}`)}>
                      View details
                    </Button>
                  </div>
                  {item.reasons.length > 0 && (
                    <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {item.reasons.map((reason) => (
                        <li key={reason} className="flex items-center gap-1 rounded-full bg-muted px-2 py-1">
                          <CheckCircle2 className="h-3 w-3 text-primary" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Start your top pick now or keep browsing the full catalog.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="outline" size="sm" onClick={() => navigate("/programs")}>View catalog</Button>
                  <Button size="sm" onClick={handleStartRecommended} disabled={!topRecommendation || isSaving}>
                    Start recommended
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
