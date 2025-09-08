import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dumbbell, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { useI18n } from "@/lib/i18n";
import { generateWorkoutPlan, getPlan, markExerciseDone, getWeeklyCompletion } from "@/lib/workouts";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Workouts() {
  const { t } = useI18n();
  const [plan, setPlan] = useState<any>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [ratio, setRatio] = useState(0);
  const [weekRatio, setWeekRatio] = useState(0);

  const todayName = dayNames[new Date().getDay()];
  const todayISO = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    getPlan().then(async (p) => {
      if (p) {
        setPlan(p);
        await loadProgress(p);
        const wk = await getWeeklyCompletion(p.id);
        setWeekRatio(wk);
      }
    });
  }, []);

  async function loadProgress(p: any) {
    const idx = p.days.findIndex((d: any) => d.day === todayName);
    if (idx < 0) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const snap = await getDoc(doc(db, `users/${uid}/workoutPlans/${p.id}/progress/${todayISO}`));
    const done = snap.exists() ? (snap.data()?.completed as string[]) || [] : [];
    setCompleted(done);
    setRatio(p.days[idx].exercises.length ? done.length / p.days[idx].exercises.length : 0);
  }

  const handleToggle = async (exerciseId: string) => {
    const idx = plan.days.findIndex((d: any) => d.day === todayName);
    const done = !completed.includes(exerciseId);
    const res = await markExerciseDone(plan.id, idx, exerciseId, done);
    setCompleted(done ? [...completed, exerciseId] : completed.filter((id) => id !== exerciseId));
    setRatio(res.ratio);
  };

  const handleGenerate = async () => {
    const res = await generateWorkoutPlan({ focus: "back" });
    const newPlan = { id: res.planId, days: res.days };
    setPlan(newPlan);
    setCompleted([]);
    setRatio(0);
    setWeekRatio(0);
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
        <div className="text-center space-y-2">
          <Dumbbell className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">{t('workouts.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {completedCount} of {totalCount} exercises completed
          </p>
          <p className="text-xs text-muted-foreground">{Math.round(weekRatio * 100)}% this week</p>
        </div>
        <div className="w-full bg-secondary rounded-full h-2">
          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${ratio * 100}%` }} />
        </div>
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
