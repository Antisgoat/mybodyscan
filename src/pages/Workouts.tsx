import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Dumbbell, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { useI18n } from "@/lib/i18n";
import { generateWorkoutPlan, getPlan, markExerciseDone, getWeeklyCompletion, adjustWorkoutDay } from "@/lib/workouts";
import { isDemoActive } from "@/lib/demoFlag";
import { track } from "@/lib/analytics";
import { toast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Workouts() {
  const { t } = useI18n();
  const [plan, setPlan] = useState<any>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [ratio, setRatio] = useState(0);
  const [weekRatio, setWeekRatio] = useState(0);
  const [bodyFeel, setBodyFeel] = useState("steady");
  const [bodyNotes, setBodyNotes] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustment, setAdjustment] = useState<any>(null);

  const todayName = dayNames[new Date().getDay()];
  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const currentPlan = await getPlan();
        if (!currentPlan) {
          if (!cancelled) {
            setPlan(null);
            setCompleted([]);
            setRatio(0);
            setWeekRatio(0);
          }
          return;
        }
        if (!cancelled) {
          setPlan(currentPlan);
        }
        await loadProgress(currentPlan, () => cancelled);
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
        if (!cancelled) {
          setPlan(null);
          setCompleted([]);
          setRatio(0);
          setWeekRatio(0);
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  async function loadProgress(p: any, isCancelled?: () => boolean) {
    const idx = p.days.findIndex((d: any) => d.day === todayName);
    if (idx < 0) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      const snap = await getDoc(doc(db, `users/${uid}/workoutPlans/${p.id}/progress/${todayISO}`));
      if (isCancelled?.()) return;
      const done = snap.exists() ? ((snap.data()?.completed as string[]) ?? []) : [];
      if (!isCancelled?.()) {
        setCompleted(done);
        setRatio(p.days[idx].exercises.length ? done.length / p.days[idx].exercises.length : 0);
      }
    } catch (error) {
      console.warn("workouts.progress", error);
      if (!isCancelled?.()) {
        setCompleted([]);
        setRatio(0);
      }
    }
  }

  const handleToggle = async (exerciseId: string) => {
    const idx = plan.days.findIndex((d: any) => d.day === todayName);
    const done = !completed.includes(exerciseId);
    try {
      const res = await markExerciseDone(plan.id, idx, exerciseId, done);
      setCompleted(done ? [...completed, exerciseId] : completed.filter((id) => id !== exerciseId));
      setRatio(res.ratio);
      if (done) track("workout_mark_done", { exerciseId });
      if (isDemoActive()) toast({ title: "Sign up to save your progress." });
    } catch (error: any) {
      if (error?.message === "demo-blocked") {
        toast({ title: "Create an account", description: "Demo mode cannot save workouts.", variant: "destructive" });
        return;
      }
      toast({ title: "Update failed", description: "Please try again.", variant: "destructive" });
    }
  };

  const handleGenerate = async () => {
    try {
      const res = await generateWorkoutPlan({ focus: "back" });
      if (!res) return;
      const newPlan = { id: res.planId, days: res.days };
      setPlan(newPlan);
      setCompleted([]);
      setRatio(0);
      setWeekRatio(0);
      setAdjustment(null);
    } catch (error: any) {
      if (error?.message === "demo-blocked") {
        toast({ title: "Create an account", description: "Demo mode cannot generate plans.", variant: "destructive" });
        return;
      }
      toast({ title: "Unable to generate", description: "Please try again later.", variant: "destructive" });
    }
  };

  const handleAdjust = async () => {
    if (!plan) return;
    const today = plan.days.find((d: any) => d.day === todayName);
    if (!today) {
      toast({ title: "No workout today", description: "This plan has today marked as a rest day." });
      return;
    }
    setAdjusting(true);
    try {
      const response = await adjustWorkoutDay({ dayId: today.day, bodyFeel, notes: bodyNotes });
      setAdjustment(response?.mods ?? null);
      if (response?.mods?.adjustments?.length) {
        const map = new Map(
          response.mods.adjustments.map((item: any) => [item.id, item]),
        );
        setPlan((prev: any) => {
          if (!prev) return prev;
          const updatedDays = prev.days.map((day: any) => {
            if (day.day !== today.day) return day;
            const updatedExercises = day.exercises.map((exercise: any) => {
              const match = map.get(exercise.id);
              if (!match) return exercise;
              return {
                ...exercise,
                sets: match.sets ?? exercise.sets,
                reps: match.reps ?? exercise.reps,
                cue: match.cue ?? exercise.cue,
              };
            });
            return { ...day, exercises: updatedExercises };
          });
          return { ...prev, days: updatedDays };
        });
      }
      toast({
        title: "Plan adjusted",
        description: response?.mods?.headline || "Workout updated for today.",
      });
    } catch (error: any) {
      if (error?.message === "demo-blocked") {
        toast({ title: "Create an account", description: "Demo mode cannot adjust workouts.", variant: "destructive" });
      } else {
        toast({ title: "Unable to adjust", description: "Please try again in a moment.", variant: "destructive" });
      }
    } finally {
      setAdjusting(false);
    }
  };

  if (!plan) {
    return (
      <div className="min-h-screen bg-background pb-16 md:pb-0">
        <Seo title="Workouts - MyBodyScan" description="Track your daily workout routine" />
        <AppHeader />
        <main className="max-w-md mx-auto p-6 space-y-6">
          <Card>
            <CardContent className="p-8 text-center">
              <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-4">No workout plan yet</h3>
              <Button onClick={handleGenerate} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Create my plan
              </Button>
            </CardContent>
          </Card>
        </main>
        <BottomNav />
      </div>
    );
  }

  const today = plan.days.find((d: any) => d.day === todayName);
  const completedCount = completed.length;
  const totalCount = today?.exercises.length || 0;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Workouts - MyBodyScan" description="Track your daily workout routine" />
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <DemoBanner />
        <div className="text-center space-y-2">
          <Dumbbell className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">{t("workouts.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {completedCount} of {totalCount} exercises completed
          </p>
          <p className="text-xs text-muted-foreground">{Math.round(weekRatio * 100)}% this week</p>
        </div>
        <div className="w-full bg-secondary rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${ratio * 100}%` }} />
        </div>
        <Card data-testid="workout-bodyfeel">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">How does your body feel?</CardTitle>
            <p className="text-sm text-muted-foreground">Tune intensity before logging today's session.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="body-feel-select">
                Body feel
              </label>
              <select
                id="body-feel-select"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={bodyFeel}
                onChange={(event) => setBodyFeel(event.target.value)}
                disabled={adjusting}
              >
                <option value="ready">Ready to push</option>
                <option value="steady">Steady</option>
                <option value="tired">Tired</option>
                <option value="sore">Sore</option>
                <option value="burned">Burned out</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-foreground" htmlFor="body-feel-notes">
                Notes (optional)
              </label>
              <Textarea
                id="body-feel-notes"
                value={bodyNotes}
                onChange={(event) => setBodyNotes(event.target.value)}
                placeholder="Slept 5h, lower back tight, etc."
                rows={3}
                disabled={adjusting}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleAdjust}
              disabled={adjusting}
              data-testid="workout-adjust-submit"
            >
              {adjusting ? "Adjusting…" : "Adjust today's plan"}
            </Button>
            {adjustment && (
              <div className="space-y-2 rounded-md border border-dashed border-primary/40 p-3 text-sm">
                <p className="font-medium text-foreground">{adjustment.headline}</p>
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  {adjustment.cues?.map((cue: string) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
        {today && today.exercises.length > 0 ? (
          <div className="space-y-4">
            {today.exercises.map((ex: any) => (
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
                        {ex.sets} sets × {ex.reps} reps
                      </p>
                      {ex.cue && <p className="text-xs text-primary/80">{ex.cue}</p>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Dumbbell className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">Rest day</h3>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
