import { useEffect, useState } from "react";
import { LibraryBig } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getTodayPlanMock, type MockWorkoutPlan } from "@/lib/workoutsShim";
import { WorkoutStreakChart } from "@/components/charts/WorkoutStreakChart";

export default function WorkoutsLibrary() {
  const [plan, setPlan] = useState<MockWorkoutPlan | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getTodayPlanMock()
      .then(setPlan)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Workout Library - MyBodyScan" description="Browse your plan and on-demand sessions" />
      <AppHeader />
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

        {plan && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Today’s focus</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="font-medium text-foreground">{plan.today.day}</div>
                <p className="text-muted-foreground">{plan.today.summary}</p>
                <ul className="space-y-2">
                  {plan.today.exercises.map((exercise) => (
                    <li key={exercise.id} className="flex flex-col rounded-md border border-border p-3">
                      <div className="text-sm font-semibold text-foreground">{exercise.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {exercise.sets} sets × {exercise.reps} • {exercise.focus}
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
                <WorkoutStreakChart data={plan.completionStreak} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>On-demand sessions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {plan.library.map((session) => (
                  <div key={session.id} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between text-sm">
                      <div>
                        <div className="font-medium text-foreground">{session.name}</div>
                        <div className="text-xs uppercase text-muted-foreground">{session.focus}</div>
                      </div>
                      <div className="text-xs text-muted-foreground text-right">
                        {session.durationMinutes} min • {session.difficulty}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" className="mt-2 w-full">
                      Swap into today
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
