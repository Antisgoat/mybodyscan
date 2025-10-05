import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import { getDailyLog, getNutritionHistory, type NutritionHistoryDay } from "@/lib/nutrition";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Nutrition() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<{ calories: number; protein?: number; carbs?: number; fat?: number }>({ calories: 0 });
  const [history, setHistory] = useState<NutritionHistoryDay[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [log, hist] = await Promise.all([
          getDailyLog(todayISO()),
          getNutritionHistory(7),
        ]);
        if (cancelled) return;
        setTotals(log?.totals ?? { calories: 0 });
        setHistory(Array.isArray(hist) ? hist : []);
      } catch (err: any) {
        console.warn("nutrition.load", err);
        if (!cancelled) {
          setError(err?.message || "Unable to load nutrition data");
          toast({ title: "Unable to load", description: err?.message || "Please try again.", variant: "destructive" });
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const mostRecent = useMemo(() => history[history.length - 1], [history]);

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Nutrition - MyBodyScan" description="Track your meal history and targets." />
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-foreground">Nutrition</h1>
          <p className="text-sm text-muted-foreground">
            Review your recent intake and manage logs from the Meals tab.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Today's totals</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : (
              <div className="space-y-1 text-sm text-foreground">
                <div className="flex items-center justify-between">
                  <span>Calories</span>
                  <span>{Math.round(totals.calories || 0)} kcal</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Protein</span>
                  <span>{Math.round(totals.protein || 0)} g</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Carbs</span>
                  <span>{Math.round(totals.carbs || 0)} g</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Fat</span>
                  <span>{Math.round(totals.fat || 0)} g</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last 7 days</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-4 w-full" />
                ))}
              </div>
            ) : history.length ? (
              <ul className="space-y-2 text-sm">
                {history.map((day) => (
                  <li key={day.date} className="flex items-center justify-between">
                    <span>{day.date}</span>
                    <span className="text-muted-foreground">{Math.round(day.totals.calories || 0)} kcal</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No nutrition logs yet.</p>
            )}
          </CardContent>
        </Card>

        {error && (
          <Card>
            <CardContent className="text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Log meals, barcode scans, and macros from the Meals tab to see them here.
            </p>
            <Button className="w-full" onClick={() => navigate("/meals")}> 
              Go to Meals
            </Button>
            {mostRecent && (
              <p className="text-xs text-muted-foreground">
                Latest entry: {mostRecent.date} · {Math.round(mostRecent.totals.calories || 0)} kcal
              </p>
            )}
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
