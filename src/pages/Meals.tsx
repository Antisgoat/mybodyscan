import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Utensils, Plus, Trash2, Info } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { addMeal, deleteMeal, getDailyLog, computeCalories, MealEntry } from "@/lib/nutrition";

const DAILY_TARGET = 2200;

export default function Meals() {
  const { t } = useI18n();
  const today = new Date().toISOString().slice(0, 10);
  const [log, setLog] = useState<{ totals: any; meals: any[] }>({ totals: { calories: 0 }, meals: [] });
  const [isAdding, setIsAdding] = useState(false);
  const [meal, setMeal] = useState<MealEntry>({ name: "" });

  useEffect(() => {
    getDailyLog(today).then(setLog).catch(() => {});
  }, [today]);

  const totalCalories = log.totals.calories || 0;
  const remaining = DAILY_TARGET - totalCalories;

  async function handleAdd() {
    if (!meal.name) {
      toast({ title: "Missing name" });
      return;
    }
    const preview = computeCalories(meal);
    await addMeal(today, meal);
    const updated = await getDailyLog(today);
    setLog(updated);
    setMeal({ name: "" });
    setIsAdding(false);
    toast({ title: "Meal logged", description: `${preview.calories} kcal` });
  }

  async function handleDelete(id: string) {
    await deleteMeal(today, id);
    const updated = await getDailyLog(today);
    setLog(updated);
  }

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Meals - MyBodyScan" description="Track your daily calorie intake" />
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center space-y-2">
          <Utensils className="w-8 h-8 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">{t("meals.title")}</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-center">Daily Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-foreground">{totalCalories}</div>
              <div className="text-sm text-muted-foreground">of {DAILY_TARGET} calories</div>
            </div>
            <div className="w-full bg-secondary rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full transition-all"
                style={{ width: `${Math.min((totalCalories / DAILY_TARGET) * 100, 100)}%` }}
              />
            </div>
            <div className="text-center">
              <span className={`text-sm ${remaining >= 0 ? 'text-muted-foreground' : 'text-warning'}`}>
                {remaining >= 0 ? `${remaining} calories remaining` : `${Math.abs(remaining)} calories over target`}
              </span>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Today's Meals</h2>
          <Dialog open={isAdding} onOpenChange={setIsAdding}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Add Meal
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Log a Meal</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="meal-name">Meal Name</Label>
                  <Input id="meal-name" value={meal.name} onChange={(e) => setMeal({ ...meal, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="protein">Protein (g)</Label>
                    <Input id="protein" type="number" value={meal.protein || ''} onChange={(e) => setMeal({ ...meal, protein: parseFloat(e.target.value) || undefined })} />
                  </div>
                  <div>
                    <Label htmlFor="carbs">Carbs (g)</Label>
                    <Input id="carbs" type="number" value={meal.carbs || ''} onChange={(e) => setMeal({ ...meal, carbs: parseFloat(e.target.value) || undefined })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fat">Fat (g)</Label>
                    <Input id="fat" type="number" value={meal.fat || ''} onChange={(e) => setMeal({ ...meal, fat: parseFloat(e.target.value) || undefined })} />
                  </div>
                  <div>
                    <Label htmlFor="alcohol">Alcohol (g)</Label>
                    <Input id="alcohol" type="number" value={meal.alcohol || ''} onChange={(e) => setMeal({ ...meal, alcohol: parseFloat(e.target.value) || undefined })} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="calories">Calories (optional)</Label>
                  <Input id="calories" type="number" value={meal.calories || ''} onChange={(e) => setMeal({ ...meal, calories: parseFloat(e.target.value) || undefined })} />
                </div>
                <Button onClick={handleAdd} className="w-full">Log Meal</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {log.meals.length > 0 ? (
          <div className="space-y-3">
            {log.meals.map((m: any) => (
              <Card key={m.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-medium text-foreground">{m.name}</h3>
                        {m.reconciled && <Info className="w-3 h-3 text-muted-foreground" title="Adjusted to match macros" />}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {m.calories} cal • P: {m.protein || 0}g • C: {m.carbs || 0}g • F: {m.fat || 0}g
                      </p>
                      {m.reconciled && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Adjusted to match macros: {m.caloriesFromMacros} kcal (you entered {m.caloriesInput} kcal).
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(m.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <Utensils className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No meals logged yet</h3>
              <p className="text-sm text-muted-foreground">Start tracking your nutrition by logging your first meal</p>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
