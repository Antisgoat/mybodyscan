import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { useNavigate } from "react-router-dom";
import { useI18n } from "@/lib/i18n";
import { getDailyLog } from "@/lib/nutritionBackend";
import { getPlan, type WorkoutDay } from "@/lib/workouts";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { useDemoMode } from "@/components/DemoModeProvider";
import { DEMO_NUTRITION_LOG, DEMO_WORKOUT_PROGRESS } from "@/lib/demoContent";
import { useUserProfile } from "@/hooks/useUserProfile";
import { track } from "@/lib/analytics";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { useAuthUser } from "@/auth/mbs-auth";
import { CheckCircle2, Circle } from "lucide-react";
import { deriveDailyMomentum } from "@/lib/momentum";
import { localDateKey } from "@/lib/time";
import { todayNextAction } from "@/lib/todayNextAction";

export default function Today() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const demo = useDemoMode();
  const { user } = useAuthUser();
  const { plan: coachPlan } = useUserProfile();
  const todayISO = localDateKey();
  const [ready, setReady] = useState(demo);
  const [mealLoaded, setMealLoaded] = useState(demo);
  const [hasPlan, setHasPlan] = useState(demo);
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

  useEffect(() => {
    if (!demo && user?.uid) track("member_today_open");
  }, [demo, user?.uid]);

  useEffect(() => {
    if (demo) {
      setReady(true);
      setMealLoaded(true);
      setHasPlan(true);
      setMealTotals(DEMO_NUTRITION_LOG.totals);
      setWorkout(DEMO_WORKOUT_PROGRESS);
      return;
    }

    let cancelled = false;
    setReady(false);
    setMealLoaded(false);
    setHasPlan(false);

    const load = async () => {
      const [mealResult, planResult] = await Promise.allSettled([
        getDailyLog(todayISO),
        getPlan(),
      ]);
      if (cancelled) return;
      if (mealResult.status === "fulfilled") {
        setMealTotals(mealResult.value?.totals ?? { calories: 0 });
        setMealLoaded(true);
      } else {
        console.warn("today.loadDailyLog", mealResult.reason);
        setMealTotals({ calories: 0 });
      }

      try {
        if (planResult.status === "rejected") throw planResult.reason;
        const plan = planResult.value;
        const planDays: WorkoutDay[] = Array.isArray(plan?.days)
          ? plan.days
          : [];
        setHasPlan(planDays.some((day) => day.exercises.length > 0));
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
        const uid = user?.uid ?? null;
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
          const rawCompleted = snap.data()?.completed;
          const completedIds = new Set(
            Array.isArray(rawCompleted) ? rawCompleted : []
          );
          const done = planDays[idx].exercises.filter((exercise) =>
            completedIds.has(exercise.id)
          ).length;
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

    void load().finally(() => {
      if (!cancelled) setReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [demo, todayISO, user?.uid]);

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
  const momentum = deriveDailyMomentum({
    mealCalories: mealTotals.calories,
    workoutDone: workout.done,
    workoutTotal: workout.total,
  });
  const nextAction = todayNextAction({
    hasWorkout: workout.done < workout.total,
    hasPlan,
    workoutDone: workout.done,
    mealLogged: mealTotals.calories > 0,
    mealLoaded,
  });

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
        <h1 className="text-2xl font-semibold text-foreground">
          {t("today.title")}
        </h1>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your next step</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ready ? (
              <Button
                className="w-full"
                onClick={() => navigate(nextAction.path)}
              >
                {nextAction.label}
              </Button>
            ) : (
              <p role="status" className="text-sm text-muted-foreground">
                Checking today’s plan…
              </p>
            )}
            {ready && hasPlan && nextAction.path !== "/weekly-review" && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate("/weekly-review")}
              >
                Weekly check-in
              </Button>
            )}
          </CardContent>
        </Card>

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
            <CardTitle className="text-lg">Today’s momentum</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {momentum.completed} of {momentum.available} supportive actions
              </span>
              <span className="font-medium tabular-nums">
                {momentum.percent}%
              </span>
            </div>
            <div
              className="h-2 overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-label="Today's momentum"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={momentum.percent}
            >
              <div
                className="h-full rounded-full bg-primary transition-[width]"
                style={{ width: `${momentum.percent}%` }}
              />
            </div>
            <ul className="space-y-2 text-sm">
              {momentum.actions.map((action) => (
                <li key={action.id} className="flex items-center gap-2">
                  {action.complete ? (
                    <CheckCircle2
                      className="h-4 w-4 text-primary"
                      aria-hidden="true"
                    />
                  ) : (
                    <Circle
                      className="h-4 w-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={
                      action.complete
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }
                  >
                    {action.label}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Missing a day never erases prior work. Momentum highlights
              repeatable actions, not body size or appearance.
            </p>
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
    </div>
  );
}
