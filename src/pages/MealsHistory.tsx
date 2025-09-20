import { useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NutritionMacrosChart } from "@/components/charts/NutritionMacrosChart";
import { dailyTotalsMock, type MockDailyTotals } from "@/lib/nutritionShim";
import { useI18n } from "@/lib/i18n";

export default function MealsHistory() {
  const { t } = useI18n();
  const [range, setRange] = useState<7 | 30>(7);
  const [data, setData] = useState<MockDailyTotals[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    dailyTotalsMock(range)
      .then(setData)
      .finally(() => setLoading(false));
  }, [range]);

  const averages = data.reduce(
    (acc, day) => {
      acc.calories += day.calories;
      acc.protein += day.protein;
      acc.carbs += day.carbs;
      acc.fat += day.fat;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const divisor = data.length || 1;

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Meal History - MyBodyScan" description="Review your recent nutrition trends" />
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <DemoBanner />
        <div className="space-y-2 text-center">
          <CalendarRange className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">{t('meals.weeklyChart')}</h1>
          <p className="text-sm text-muted-foreground">Compare 7-day vs 30-day calorie and macro trends.</p>
        </div>

        <div className="flex justify-center gap-2">
          {[7, 30].map((value) => (
            <Button
              key={value}
              size="sm"
              variant={range === value ? "default" : "outline"}
              onClick={() => setRange(value as 7 | 30)}
            >
              Last {value} days
            </Button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Calories & macros</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Loading chart…
              </div>
            ) : (
              <NutritionMacrosChart data={data} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Averages</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-xs uppercase text-muted-foreground">Calories</div>
              <div className="text-lg font-semibold">{Math.round(averages.calories / divisor)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Protein</div>
              <div className="text-lg font-semibold">{Math.round(averages.protein / divisor)}g</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Carbs</div>
              <div className="text-lg font-semibold">{Math.round(averages.carbs / divisor)}g</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Fat</div>
              <div className="text-lg font-semibold">{Math.round(averages.fat / divisor)}g</div>
            </div>
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
