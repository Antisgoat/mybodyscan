import { useEffect, useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { Card, CardContent } from "@/components/ui/card";
import { getWorkouts } from "@/lib/workouts";

export default function WorkoutsCompleted() {
  const [workouts, setWorkouts] = useState<Awaited<ReturnType<typeof getWorkouts>>>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getWorkouts()
      .then(setWorkouts)
      .catch((err) => setError(err?.message || "Unable to load workouts"));
  }, []);

  const completedDays = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 14 }).reduce<{ date: string; completed: boolean }[]>((acc, _, idx) => {
      const d = new Date(today);
      d.setDate(today.getDate() - idx);
      const iso = d.toISOString().slice(0, 10);
      const completed = Boolean(workouts?.progress?.[iso]?.length);
      if (completed) acc.push({ date: iso, completed });
      return acc;
    }, []);
  }, [workouts]);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Completed Workouts - MyBodyScan" description="Celebrate your recent streak" />
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
              {error || "No workouts logged yet — your next completion will show up here."}
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
