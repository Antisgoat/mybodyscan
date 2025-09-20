import { useEffect, useMemo, useState } from "react";
import { Utensils, Plus, History, Sparkles, Copy, Barcode } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { addMeal, deleteMeal, getDailyLog, computeCalories, type MealEntry } from "@/lib/nutrition";
import { searchFoods, type NutritionItem } from "@/lib/nutritionShim";

const DAILY_TARGET = 2200;
const RECENTS_KEY = "mbs_recent_foods";

interface RecentItem {
  name: string;
  perServing: NutritionItem["perServing"];
}

export default function Meals() {
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [log, setLog] = useState<{ totals: any; meals: MealEntry[] }>({ totals: { calories: 0 }, meals: [] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MealEntry | null>(null);
  const [editMacros, setEditMacros] = useState({ protein: "", carbs: "", fat: "", calories: "" });
  const [recents, setRecents] = useState<RecentItem[]>([]);

  useEffect(() => {
    getDailyLog(todayISO)
      .then((data) => {
        setLog(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    const stored = localStorage.getItem(RECENTS_KEY);
    if (stored) {
      try {
        setRecents(JSON.parse(stored));
      } catch {
        setRecents([]);
      }
    }
  }, [todayISO]);

  const totalCalories = log.totals.calories || 0;
  const remaining = DAILY_TARGET - totalCalories;
  const progress = Math.min(100, (totalCalories / DAILY_TARGET) * 100);

  const updateRecents = (item: NutritionItem) => {
    const next: RecentItem[] = [
      { name: item.name, perServing: item.perServing },
      ...recents.filter((recent) => recent.name !== item.name),
    ].slice(0, 6);
    setRecents(next);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  };

  const refreshLog = async () => {
    const updated = await getDailyLog(todayISO);
    setLog(updated);
  };

  const handleDelete = async (id: string) => {
    await deleteMeal(todayISO, id);
    toast({ title: "Meal removed" });
    refreshLog();
  };

  const handleEdit = (meal: MealEntry) => {
    setEditing(meal);
    setEditMacros({
      protein: meal.protein?.toString() ?? "",
      carbs: meal.carbs?.toString() ?? "",
      fat: meal.fat?.toString() ?? "",
      calories: meal.calories?.toString() ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    const updated: MealEntry = {
      ...editing,
      protein: parseFloat(editMacros.protein) || 0,
      carbs: parseFloat(editMacros.carbs) || 0,
      fat: parseFloat(editMacros.fat) || 0,
      calories: parseFloat(editMacros.calories) || undefined,
    };
    await addMeal(todayISO, updated);
    toast({ title: "Meal updated" });
    setEditing(null);
    refreshLog();
  };

  const quickAdd = async (item: RecentItem) => {
    const entry: MealEntry = {
      name: item.name,
      protein: item.perServing.protein_g ?? undefined,
      carbs: item.perServing.carbs_g ?? undefined,
      fat: item.perServing.fat_g ?? undefined,
      calories: item.perServing.kcal ?? undefined,
    };
    await addMeal(todayISO, entry);
    toast({ title: "Meal logged", description: `${item.name} added` });
    refreshLog();
  };

  const copyYesterday = async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const prior = await getDailyLog(yesterday);
    if (!prior.meals.length) {
      toast({ title: "No meals yesterday", description: "Nothing to copy." });
      return;
    }
    for (const meal of prior.meals) {
      await addMeal(todayISO, { ...meal, id: undefined });
    }
    toast({ title: "Copied", description: "Yesterday's meals added" });
    refreshLog();
  };

  const templateAdds = async () => {
    const template: NutritionItem = {
      id: "template-balance",
      name: "Balanced Plate",
      brand: "Template",
      serving: { text: "1 meal" },
      source: "mock",
      upc: undefined,
      perServing: { kcal: 550, protein_g: 40, carbs_g: 45, fat_g: 18 },
    };
    updateRecents(template);
    await addMeal(todayISO, {
      name: template.name,
      protein: template.perServing.protein_g ?? undefined,
      carbs: template.perServing.carbs_g ?? undefined,
      fat: template.perServing.fat_g ?? undefined,
      calories: template.perServing.kcal ?? undefined,
    });
    toast({ title: "Template added", description: "Balanced Plate logged" });
    refreshLog();
  };

  const handleSearchQuickAdd = async () => {
    const items = await searchFoods("protein");
    if (items[0]) {
      updateRecents(items[0]);
      await addMeal(todayISO, {
        name: items[0].name,
        protein: items[0].perServing.protein_g ?? undefined,
        carbs: items[0].perServing.carbs_g ?? undefined,
        fat: items[0].perServing.fat_g ?? undefined,
        calories: items[0].perServing.kcal ?? undefined,
      });
      toast({ title: "Quick add", description: `${items[0].name} logged` });
      refreshLog();
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Meals - MyBodyScan" description="Track your daily nutrition" />
      <AppHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <div className="space-y-2 text-center">
          <Utensils className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-3xl font-semibold text-foreground">Today's Meals</h1>
          <p className="text-sm text-muted-foreground">Log foods from search, barcode, or quick adds. Units shown in US measurements.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daily Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center">
              <div className="text-4xl font-bold text-foreground">{Math.round(totalCalories)}</div>
              <div className="text-sm text-muted-foreground">of {DAILY_TARGET} calories</div>
            </div>
            <div className="h-3 w-full rounded-full bg-muted">
              <div className="h-3 rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Protein: {log.totals.protein ?? 0}g</span>
              <span>Carbs: {log.totals.carbs ?? 0}g</span>
              <span>Fat: {log.totals.fat ?? 0}g</span>
            </div>
            <div className="text-center text-sm font-medium">
              {remaining >= 0 ? `${remaining} calories remaining` : `${Math.abs(remaining)} over target`}
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="default" size="sm" asChild>
                <a href="/meals/search">
                  <Plus className="mr-1 h-4 w-4" /> Search Foods
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="/barcode">
                  <Barcode className="mr-1 h-4 w-4" /> Scan Barcode
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={handleSearchQuickAdd}>
                <Sparkles className="mr-1 h-4 w-4" /> Quick Suggestion
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Add</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {recents.map((item) => (
                <Button key={item.name} size="sm" variant="secondary" onClick={() => quickAdd(item)}>
                  {item.name}
                </Button>
              ))}
              {!recents.length && <p className="text-xs text-muted-foreground">Search foods to build your recents list.</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={templateAdds}>
                <Sparkles className="mr-1 h-4 w-4" /> Balanced Plate
              </Button>
              <Button variant="outline" size="sm" onClick={copyYesterday}>
                <Copy className="mr-1 h-4 w-4" /> Copy Yesterday
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Logged Meals</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <a href="/meals/history">
                <History className="mr-1 h-4 w-4" /> History
              </a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Loading meals…</p>}
            {!loading && !log.meals.length && (
              <p className="text-sm text-muted-foreground">No meals logged yet. Start with search, barcode, or quick add.</p>
            )}
            {log.meals.map((meal) => (
              <Card key={meal.id || meal.name} className="border">
                <CardContent className="space-y-2 py-4 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-foreground">{meal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {meal.calories ?? computeCalories(meal).calories} kcal • {meal.protein ?? 0}g P • {meal.carbs ?? 0}g C • {meal.fat ?? 0}g F
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(meal)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => meal.id && handleDelete(meal.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>

        {editing && (
          <Card>
            <CardHeader>
              <CardTitle>Edit {editing.name}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="protein">Protein (g)</Label>
                <Input
                  id="protein"
                  type="number"
                  value={editMacros.protein}
                  onChange={(event) => setEditMacros((prev) => ({ ...prev, protein: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="carbs">Carbs (g)</Label>
                <Input
                  id="carbs"
                  type="number"
                  value={editMacros.carbs}
                  onChange={(event) => setEditMacros((prev) => ({ ...prev, carbs: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="fat">Fat (g)</Label>
                <Input
                  id="fat"
                  type="number"
                  value={editMacros.fat}
                  onChange={(event) => setEditMacros((prev) => ({ ...prev, fat: event.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="calories">Calories</Label>
                <Input
                  id="calories"
                  type="number"
                  value={editMacros.calories}
                  onChange={(event) => setEditMacros((prev) => ({ ...prev, calories: event.target.value }))}
                />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button onClick={saveEdit}>Save</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
