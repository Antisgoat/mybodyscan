import { useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
import { AppHeader } from "@app/components/AppHeader.tsx";
import { BottomNav } from "@app/components/BottomNav.tsx";
import { Seo } from "@app/components/Seo.tsx";
import { Button } from "@app/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@app/components/ui/card.tsx";
import { NutritionMacrosChart } from "@app/components/charts/NutritionMacrosChart.tsx";
import { getNutritionHistory, type NutritionHistoryDay } from "@app/lib/nutrition.ts";

export default function MealsHistory() {
  const [range, setRange] = useState<7 | 30>(30);
  const [data, setData] = useState<NutritionHistoryDay[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getNutritionHistory(range)
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [range]);

  const totals = data.reduce(
    (acc, day) => {
      acc.calories += day.totals.calories || 0;
      acc.protein += day.totals.protein || 0;
      acc.carbs += day.totals.carbs || 0;
      acc.fat += day.totals.fat || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const divisor = data.length || 1;
  const maxCalories = Math.max(...data.map((day) => day.totals.calories || 0), 1);
  const chartData = data.map((day) => ({
    date: new Date(day.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    calories: day.totals.calories || 0,
    protein: day.totals.protein || 0,
    carbs: day.totals.carbs || 0,
    fat: day.totals.fat || 0,
  }));

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Meal History - MyBodyScan" description="Review your recent nutrition trends" />
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <div className="space-y-2 text-center">
          <CalendarRange className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">Nutrition History</h1>
          <p className="text-sm text-muted-foreground">Compare 7-day and 30-day trends with adherence heatmap.</p>
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
              <NutritionMacrosChart data={chartData} />
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
              <div className="text-lg font-semibold">{Math.round(totals.calories / divisor)}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Protein</div>
              <div className="text-lg font-semibold">{Math.round(totals.protein / divisor)}g</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Carbs</div>
              <div className="text-lg font-semibold">{Math.round(totals.carbs / divisor)}g</div>
            </div>
            <div>
              <div className="text-xs uppercase text-muted-foreground">Fat</div>
              <div className="text-lg font-semibold">{Math.round(totals.fat / divisor)}g</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adherence Heatmap</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-7 gap-2 text-xs">
            {data.map((day) => {
              const calories = day.totals.calories || 0;
              const intensity = Math.min(1, calories / maxCalories);
              const background = `rgba(34,197,94,${0.2 + intensity * 0.6})`;
              return (
                <div
                  key={day.date}
                  className="flex h-12 flex-col items-center justify-center rounded-md text-foreground"
                  style={{ background }}
                >
                  <span className="font-medium">{new Date(day.date).getDate()}</span>
                  <span className="text-[10px]">{Math.round(calories)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
