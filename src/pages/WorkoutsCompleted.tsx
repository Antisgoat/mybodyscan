import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { AppHeader } from "@app/components/AppHeader.tsx";
import { BottomNav } from "@app/components/BottomNav.tsx";
import { DemoBanner } from "@app/components/DemoBanner.tsx";
import { Seo } from "@app/components/Seo.tsx";
import { Card, CardContent } from "@app/components/ui/card.tsx";
import { getTodayPlanMock, type MockWorkoutPlan } from "@app/lib/workoutsShim.ts";

export default function WorkoutsCompleted() {
  const [plan, setPlan] = useState<MockWorkoutPlan | null>(null);

  useEffect(() => {
    getTodayPlanMock().then(setPlan);
  }, []);

  const completedDays = useMemo(() => {
    if (!plan) return [];
    return plan.completionStreak.filter((item) => item.completed);
  }, [plan]);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Completed Workouts - MyBodyScan" description="Celebrate your recent streak" />
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <DemoBanner />
        <div className="space-y-2 text-center">
          <Trophy className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">Completed Workouts</h1>
          <p className="text-sm text-muted-foreground">Keep the streak alive! These were logged over the last 14 days.</p>
        </div>

        {completedDays.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No workouts logged yet — your next completion will show up here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {completedDays.map((entry) => (
              <Card key={entry.date}>
                <CardContent className="flex items-center justify-between py-4 text-sm">
                  <div>
                    <div className="font-medium text-foreground">{new Date(entry.date).toLocaleDateString()}</div>
                    <div className="text-xs text-muted-foreground">Strength + conditioning</div>
                  </div>
                  <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                    Completed
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
