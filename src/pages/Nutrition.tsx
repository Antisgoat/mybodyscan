import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/hooks/use-toast";
import {
  getDailyLog,
  getNutritionHistory,
  type NutritionHistoryDay,
} from "@/lib/nutritionBackend";
import { useAuthUser } from "@/lib/auth";
import { ErrorBoundary } from "@/components/system/ErrorBoundary";
import { roundGrams, roundKcal } from "@/lib/nutritionMath";
import NutritionSearch from "@/components/NutritionSearch";

const todayISO = () => new Date().toISOString().slice(0, 10);

export default function Nutrition() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { authReady, user } = useAuthUser();
  const appCheckReady = true;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totals, setTotals] = useState<{
    calories: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  }>({ calories: 0 });
  const [history, setHistory] = useState<NutritionHistoryDay[]>([]);

  const loadNutrition = useCallback(async () => {
    if (!authReady || !appCheckReady) {
      return;
    }
    if (!user) {
      setTotals({ calories: 0 });
      setHistory([]);
      setError("Sign in to view nutrition data.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [log, hist] = await Promise.all([
        getDailyLog(todayISO()),
        getNutritionHistory(7),
      ]);
      setTotals(log?.totals ?? { calories: 0 });
      setHistory(Array.isArray(hist) ? hist : []);
    } catch (err: any) {
      console.warn("nutrition.load", err);
      setError(err?.message || "Unable to load nutrition data");
      toast({
        title: "Unable to load",
        description: err?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [appCheckReady, authReady, toast, user]);

  useEffect(() => {
    void loadNutrition();
  }, [loadNutrition]);

  const handleMealLogged = useCallback(() => {
    void loadNutrition();
  }, [loadNutrition]);

  const mostRecent = useMemo(() => history[history.length - 1], [history]);

  const initializing = false;

  return (
    <div
      className="min-h-screen bg-background pb-16 md:pb-0"
      data-testid="route-nutrition"
    >
      <Seo
        title="Nutrition - MyBodyScan"
        description="Track your meal history and targets."
      />
      <ErrorBoundary
        title="Nutrition is unavailable"
        description="Reload to try again or check back shortly."
      >
        <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Nutrition
            </h1>
            <p className="text-sm text-muted-foreground">
              Review your recent intake and manage logs from the Meals tab.
            </p>
          </div>

          <Card>
            <CardContent>
              {user ? (
                <NutritionSearch onMealLogged={handleMealLogged} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Sign in to search foods and scan barcodes.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Today's totals</CardTitle>
            </CardHeader>
            <CardContent data-testid="nutrition-totals">
              {initializing ? (
                <p className="text-sm text-muted-foreground">
                  Initializing secure nutrition services…
                </p>
              ) : loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                </div>
              ) : (
                <div className="space-y-1 text-sm text-foreground">
                  <div className="flex items-center justify-between">
                    <span>Calories</span>
                    <span>{roundKcal(totals.calories ?? 0)} kcal</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Protein</span>
                    <span>{roundGrams(totals.protein ?? 0)} g</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Carbs</span>
                    <span>{roundGrams(totals.carbs ?? 0)} g</span>
                  </div>
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Fat</span>
                    <span>{roundGrams(totals.fat ?? 0)} g</span>
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
              {initializing ? (
                <p className="text-sm text-muted-foreground">
                  Initializing secure nutrition services…
                </p>
              ) : loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <Skeleton key={idx} className="h-4 w-full" />
                  ))}
                </div>
              ) : history.length ? (
                <ul className="space-y-2 text-sm">
                  {history.map((day) => (
                    <li
                      key={day.date}
                      className="flex items-center justify-between"
                    >
                      <span>{day.date}</span>
                      <span className="text-muted-foreground">
                        {roundKcal(day.totals.calories ?? 0)} kcal
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No nutrition logs yet.
                </p>
              )}
            </CardContent>
          </Card>

          {error && (
            <Card>
              <CardContent className="text-sm text-destructive">
                {error}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Log meals, barcode scans, and macros from the Meals tab to see
                them here.
              </p>
              <Button className="w-full" onClick={() => navigate("/meals")}>
                Go to Meals
              </Button>
              {mostRecent && (
                <p className="text-xs text-muted-foreground">
                  Latest entry: {mostRecent.date} ·{" "}
                  {roundKcal(mostRecent.totals.calories ?? 0)} kcal
                </p>
              )}
            </CardContent>
          </Card>
        </main>
        <BottomNav />
      </ErrorBoundary>
    </div>
  );
}
