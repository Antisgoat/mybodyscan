import { useEffect, useMemo, useState } from "react";
import { LibraryBig } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getWorkouts, type WorkoutDay } from "@/lib/workouts";
import { WorkoutStreakChart } from "@/components/charts/WorkoutStreakChart";

export default function WorkoutsLibrary() {
  const [workouts, setWorkouts] = useState<Awaited<ReturnType<typeof getWorkouts>>>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getWorkouts()
      .then(setWorkouts)
      .catch((err) => {
        setError(err?.message || "Unable to load workouts");
      })
      .finally(() => setLoading(false));
  }, []);

  const todayPlan: WorkoutDay | null = useMemo(() => {
    if (!workouts?.days?.length) return null;
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const today = dayNames[new Date().getDay()];
    return workouts.days.find((d) => d.day === today) ?? workouts.days[0] ?? null;
  }, [workouts]);

  const streak = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }).map((_, idx) => {
      const d = new Date(today);
      d.setDate(today.getDate() - (13 - idx));
      const iso = d.toISOString().slice(0, 10);
      const completed = Boolean(workouts?.progress?.[iso]?.length);
      return { date: iso, completed };
    });
  }, [workouts]);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Workout Library - MyBodyScan" description="Browse your plan and on-demand sessions" />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <DemoBanner />
        <div className="space-y-2 text-center">
          <LibraryBig className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">Workout Library</h1>
          <p className="text-sm text-muted-foreground">Today’s plan plus on-demand sessions to swap in.</p>
        </div>

        {loading && (
          <Card>
            <CardContent className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
              Loading workouts…
            </CardContent>
          </Card>
        )}

        {error && !loading && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {todayPlan && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Today’s focus</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="font-medium text-foreground">{todayPlan.day}</div>
                <p className="text-muted-foreground">
                  Complete each set to keep your streak alive. We’ll mark completions as you log them.
                </p>
                <ul className="space-y-2">
                  {todayPlan.exercises.map((exercise) => (
                    <li key={exercise.id} className="flex flex-col rounded-md border p-3">
                      <div className="text-sm font-semibold text-foreground">{exercise.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {exercise.sets ?? "-"} sets × {exercise.reps ?? "-"}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Completion streak</CardTitle>
              </CardHeader>
              <CardContent>
                <WorkoutStreakChart data={streak} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>This week’s plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {workouts?.days?.map((day) => (
                  <div key={day.day} className="rounded-md border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-foreground">{day.day}</div>
                      <div className="text-xs text-muted-foreground">{day.exercises.length} movements</div>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {day.exercises.slice(0, 3).map((ex) => (
                        <li key={ex.id}>
                          {ex.name} — {ex.sets ?? "-"}×{ex.reps ?? "-"}
                        </li>
                      ))}
                      {day.exercises.length === 0 && <li>No exercises listed yet.</li>}
                    </ul>
                  </div>
                ))}
                {!workouts?.days?.length && (
                  <div className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    No workout plan found yet. Generate a plan to start tracking your sessions.
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!todayPlan && !loading && !error && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No workout plan found yet. Generate a plan to start tracking sessions.
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
