import { useMemo, useState } from "react";
import { ArrowLeft, Search, Utensils } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserProfile } from "@/hooks/useUserProfile";
import { deriveNutritionGoals } from "@/lib/nutritionGoals";
import { buildWeeklyMealPlan } from "@/lib/nutrition/mealPlan";

export default function MealPlan() {
  const { plan, profile } = useUserProfile();
  const [selectedDay, setSelectedDay] = useState(0);

  const goals = useMemo(
    () =>
      deriveNutritionGoals({
        weightKg: profile?.weight_kg ?? profile?.weightKg ?? null,
        heightCm: profile?.height_cm ?? profile?.heightCm ?? null,
        age: profile?.age ?? null,
        sex: profile?.sex ?? null,
        goal:
          profile?.goal === "lose_fat"
            ? "lose_fat"
            : profile?.goal === "gain_muscle"
              ? "gain_muscle"
              : null,
        activityLevel: profile?.activity_level ?? null,
        overrides: {
          calories: plan?.calorieTarget,
          proteinGrams: plan?.proteinFloor,
        },
      }),
    [plan?.calorieTarget, plan?.proteinFloor, profile]
  );

  const weeklyPlan = useMemo(
    () =>
      buildWeeklyMealPlan(
        {
          calories: goals.calories,
          proteinGrams: goals.proteinGrams,
          carbsGrams: goals.carbsGrams,
          fatGrams: goals.fatGrams,
        },
        profile?.diet_preference ?? profile?.diet
      ),
    [goals, profile?.diet, profile?.diet_preference]
  );
  const activeDay = weeklyPlan.days[selectedDay] ?? weeklyPlan.days[0];

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo
        title="Meal Plan - MyBodyScan"
        description="A seven-day meal outline connected to your nutrition targets."
      />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Utensils className="h-6 w-6 text-primary" aria-hidden="true" />
              <h1 className="text-2xl font-semibold text-foreground">
                Your 7-day meal plan
              </h1>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Meal ideas are matched to your calculated daily targets and saved
              diet preference. Adjust portions and log what you actually eat.
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/meals">
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
              Meal diary
            </a>
          </Button>
        </div>

        <Card>
          <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-lg">Daily targets</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Calculated wellness guidance—not a prescription.
              </p>
            </div>
            <Badge variant="secondary">{weeklyPlan.dietLabel}</Badge>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Calories", `${goals.calories.toLocaleString()} kcal`],
              ["Protein", `${goals.proteinGrams} g`],
              ["Carbohydrates", `${goals.carbsGrams} g`],
              ["Fat", `${goals.fatGrams} g`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">{label}</div>
                <div className="mt-1 font-semibold tabular-nums">{value}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="tablist"
          aria-label="Meal plan day"
        >
          {weeklyPlan.days.map((day, index) => (
            <Button
              key={day.day}
              type="button"
              role="tab"
              aria-selected={index === selectedDay}
              variant={index === selectedDay ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedDay(index)}
              className="shrink-0"
            >
              {day.day.slice(0, 3)}
            </Button>
          ))}
        </div>

        <section
          className="grid gap-4 md:grid-cols-2"
          aria-label={`${activeDay.day} meals`}
        >
          {activeDay.meals.map((meal) => (
            <Card key={meal.slot}>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">{meal.slot}</CardTitle>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    about {meal.calories} kcal
                  </span>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-medium text-foreground">{meal.title}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Portion these ingredients toward {meal.proteinGrams} g
                  protein, {meal.carbsGrams} g carbohydrates, and{" "}
                  {meal.fatGrams} g fat.
                </p>
                <Button variant="outline" size="sm" asChild>
                  <a href="/meals/search">
                    <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                    Find and log foods
                  </a>
                </Button>
              </CardContent>
            </Card>
          ))}
        </section>

        <Alert>
          <AlertTitle>Check ingredients for your needs</AlertTitle>
          <AlertDescription>
            These meal ideas are not allergen-screened and do not account for
            medical diets. Verify labels and ingredients, and ask a qualified
            clinician or dietitian before making major changes if you are
            pregnant, under 18, managing a condition, or have food allergies.
          </AlertDescription>
        </Alert>
      </main>
      <BottomNav />
    </div>
  );
}
