import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { getDailyLog } from "@/lib/nutritionBackend";
import { getPlan } from "@/lib/workouts";
import { DemoBanner } from "@/components/DemoBanner";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useDemoMode } from "@/components/DemoModeProvider";
import { DEMO_NUTRITION_LOG, DEMO_WORKOUT_PROGRESS } from "@/lib/demoContent";
import { useUserProfile } from "@/hooks/useUserProfile";
import { track } from "@/lib/analytics";
import { DemoWriteButton } from "@/components/DemoWriteGuard";

export default function Today() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const demo = useDemoMode();
  const { plan: coachPlan } = useUserProfile();
  const todayISO = new Date().toISOString().slice(0, 10);
  // Health connectors are not live yet; always surface the "coming soon" banner
  // so users aren't misled into thinking data is syncing.
  const healthConfigured = false;
  const [mealTotals, setMealTotals] = useState<{
    calories: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  }>(() =>
    demo
      ? DEMO_NUTRITION_LOG.totals
      : { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const [workout, setWorkout] = useState<{ done: number; total: number }>(() =>
    demo ? DEMO_WORKOUT_PROGRESS : { done: 0, total: 0 }
  );

  type WorkoutDay = {
    day: string;
    exercises: Array<{ length: number }>;
  };

  useEffect(() => {
    if (demo) {
      setMealTotals(DEMO_NUTRITION_LOG.totals);
      setWorkout(DEMO_WORKOUT_PROGRESS);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const log = await getDailyLog(todayISO);
        if (!cancelled) {
          setMealTotals(log?.totals ?? { calories: 0 });
        }
      } catch (error) {
        console.warn("today.loadDailyLog", error);
        if (!cancelled) {
          setMealTotals({ calories: 0 });
        }
      }

      try {
        const plan = await getPlan();
        const planDays = Array.isArray(plan?.days)
          ? (plan.days as WorkoutDay[])
          : [];
        if (!plan || planDays.length === 0) {
          if (!cancelled) {
            setWorkout({ done: 0, total: 0 });
          }
          return;
        }
        const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
          new Date().getDay()
        ];
        const idx = planDays.findIndex((d) => d.day === dayName);
        if (idx < 0) {
          if (!cancelled) {
            setWorkout({ done: 0, total: 0 });
          }
          return;
        }
        const uid = auth.currentUser?.uid;
        if (!uid) {
          if (!cancelled) {
            setWorkout({ done: 0, total: planDays[idx].exercises.length });
          }
          return;
        }
        try {
          const snap = await getDoc(
            doc(db, `users/${uid}/workoutPlans/${plan.id}/progress/${todayISO}`)
          );
          const done = snap.exists()
            ? ((snap.data()?.completed as string[])?.length ?? 0)
            : 0;
          if (!cancelled) {
            setWorkout({ done, total: planDays[idx].exercises.length });
          }
        } catch (error) {
          console.warn("today.loadWorkout", error);
          if (!cancelled) {
            setWorkout({ done: 0, total: planDays[idx].exercises.length });
          }
        }
      } catch (error) {
        console.warn("today.loadPlan", error);
        if (!cancelled) {
          setWorkout({ done: 0, total: 0 });
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [demo, todayISO]);

  const handleScan = () => {
    track("start_scan_click");
    navigate("/scan");
  };

  const handleLogMeal = () => {
    track("log_meal_click");
    navigate("/meals");
  };

  const handleLogWorkout = () => {
    track("log_workout_click");
    navigate("/workouts");
  };

  const calorieTarget = coachPlan?.calorieTarget ?? null;
  const formattedTarget =
    calorieTarget && Number.isFinite(calorieTarget)
      ? `${calorieTarget.toLocaleString()} calories`
      : t("today.noCalorieTarget");
  const calorieProgress =
    calorieTarget && calorieTarget > 0
      ? Math.min(((mealTotals.calories || 0) / calorieTarget) * 100, 100)
      : 0;
  const caloriesRemaining =
    calorieTarget && calorieTarget > 0
      ? Math.max(0, Math.round(calorieTarget - (mealTotals.calories || 0)))
      : null;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo
        title="Today - MyBodyScan"
        description="Your daily health and fitness plan"
      />
      <main
        className="max-w-md mx-auto p-6 space-y-6"
        data-testid="today-dashboard"
      >
        <DemoBanner />
        <h1 className="text-2xl font-semibold text-foreground">
          {t("today.title")}
        </h1>
        {!healthConfigured && (
          <Card>
            <CardContent className="space-y-2 py-4">
              <p className="text-sm font-medium">Health data unavailable</p>
              <p className="text-sm text-muted-foreground">
                Health connectors are coming soon. For now, steps and vitals
                won’t appear here.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("today.workout")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              {workout.done} of {workout.total} exercises completed today
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("today.meals")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Target: {formattedTarget}
              </span>
              <span className="text-sm font-medium">
                {mealTotals.calories}
                {calorieTarget && calorieTarget > 0
                  ? ` / ${calorieTarget.toLocaleString()}`
                  : ""}
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full"
                style={{ width: `${calorieProgress}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground">
              {caloriesRemaining != null
                ? `${caloriesRemaining.toLocaleString()} calories remaining`
                : t("today.caloriesNoTarget")}
            </div>
            <div className="text-xs text-muted-foreground">
              Consumed • P {mealTotals.protein ?? 0}g · C{" "}
              {mealTotals.carbs ?? 0}g · F {mealTotals.fat ?? 0}g
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t("today.coachingTip")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Consistency beats perfection. Small daily actions compound into
              significant results over time.
            </p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <DemoWriteButton onClick={handleScan} className="w-full">
            {t("today.scan")}
          </DemoWriteButton>
          <Button
            variant="secondary"
            onClick={handleLogMeal}
            className="w-full"
          >
            {t("today.logMeal")}
          </Button>
          <Button
            variant="secondary"
            onClick={handleLogWorkout}
            className="w-full"
          >
            {t("today.logWorkout")}
          </Button>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
