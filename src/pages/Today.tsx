import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { consumeOneCredit } from "@/lib/payments";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { getDailyLog } from "@/lib/nutrition";
import { getPlan } from "@/lib/workouts";
import { DemoBanner } from "@/components/DemoBanner";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { track } from "@/lib/analytics";
import { startScan } from "@/lib/scan";

export default function Today() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const todayISO = new Date().toISOString().slice(0, 10);
  const [mealTotals, setMealTotals] = useState<any>({ calories: 0 });
  const [workout, setWorkout] = useState<{ done: number; total: number }>({ done: 0, total: 0 });

  useEffect(() => {
    getDailyLog(todayISO).then((d) => setMealTotals(d.totals));
    getPlan().then(async (p) => {
      if (!p) return;
      const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][new Date().getDay()];
      const idx = p.days.findIndex((d: any) => d.day === dayName);
      if (idx >= 0) {
        const uid = auth.currentUser?.uid;
        if (uid) {
          const snap = await getDoc(doc(db, `users/${uid}/workoutPlans/${p.id}/progress/${todayISO}`));
          const done = snap.exists() ? (snap.data()?.completed as string[])?.length || 0 : 0;
          setWorkout({ done, total: p.days[idx].exercises.length });
        }
      }
    });
  }, [todayISO]);

  const handleScan = async () => {
    try {
      track("start_scan_click");
        await consumeOneCredit();
        const scan = await startScan();
        toast({ title: "Credit used", description: "Starting scan..." });
        navigate("/scan", { state: scan });
      } catch (err: any) {
        if (err?.message === "demo-blocked") {
          // already handled
        } else if (err?.message?.includes("No credits")) {
          toast({
            title: "No credits available",
            description: "Purchase credits to continue scanning.",
            variant: "destructive",
          });
          navigate("/plans");
        } else {
        toast({
          title: "Error",
          description: err?.message || "Failed to start scan",
          variant: "destructive",
        });
      }
    }
  };

  const handleLogMeal = () => {
    track("log_meal_click");
    navigate("/meals");
  };

  const handleLogWorkout = () => {
    track("log_workout_click");
    navigate("/workouts");
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Today - MyBodyScan" description="Your daily health and fitness plan" />
        <AppHeader />
        <main className="max-w-md mx-auto p-6 space-y-6">
          <DemoBanner />
          <h1 className="text-2xl font-semibold text-foreground">{t('today.title')}</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('today.workout')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {workout.done} of {workout.total} exercises completed today
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('today.meals')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Target: 2,200 calories</span>
              <span className="text-sm font-medium">{mealTotals.calories} / 2,200</span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min((mealTotals.calories || 0) / 2200 * 100, 100)}%` }} />
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.max(0, 2200 - (mealTotals.calories || 0))} calories remaining
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('today.coachingTip')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Consistency beats perfection. Small daily actions compound into significant results over time.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <Button onClick={handleScan} className="w-full">
            {t('today.scan')}
          </Button>
          <Button variant="secondary" onClick={handleLogMeal} className="w-full">
            {t('today.logMeal')}
          </Button>
          <Button variant="secondary" onClick={handleLogWorkout} className="w-full">
            {t('today.logWorkout')}
          </Button>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
