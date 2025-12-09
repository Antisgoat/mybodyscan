import { useCallback, useEffect, useMemo, useState } from "react";
import { Utensils, Plus, History, Copy, Barcode, ListPlus, Star, Trash } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoToast } from "@/lib/demoToast";
import { DEMO_FAVORITES, DEMO_NUTRITION_HISTORY, DEMO_NUTRITION_LOG, DEMO_TEMPLATES } from "@/lib/demoContent";
import {
  addMeal,
  deleteMeal,
  getDailyLog,
  getNutritionHistory,
  type MealEntry,
  type NutritionHistoryDay,
} from "@/lib/nutritionBackend";
import type { FoodItem } from "@/lib/nutrition/types";
import {
  subscribeFavorites,
  subscribeTemplates,
  saveTemplate,
  deleteTemplate,
  type FavoriteDocWithId,
  type TemplateDocWithId,
} from "@/lib/nutritionCollections";
import {
  calculateSelection,
  type ServingUnit,
  buildMealEntry,
  normalizedFromSnapshot,
} from "@/lib/nutritionMath";
import { ServingEditor } from "@/components/nutrition/ServingEditor";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NutritionMacrosChart } from "@/components/charts/NutritionMacrosChart";
import NutritionSearch from "@/features/meals/NutritionSearch";
import { useAuthUser } from "@/lib/useAuthUser";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";

const RECENTS_KEY = "mbs_nutrition_recents_v3";
const MAX_RECENTS = 50;
const DAILY_TARGET = 2200;

type RecentItem = FoodItem;

function readRecents(): RecentItem[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(RECENTS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_RECENTS);
    }
  } catch (error) {
    console.warn("recents_parse_error", error);
  }
  return [];
}

function storeRecents(items: RecentItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
}

function formatServingQuantity(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toString();
}

export default function Meals() {
  const demo = useDemoMode();
  const { user, authReady } = useAuthUser();
  const uid = authReady ? user?.uid ?? null : null;
  const { health: systemHealth } = useSystemHealth();
  const { nutritionConfigured } = computeFeatureStatuses(systemHealth ?? undefined);
  const nutritionUnavailable = nutritionConfigured === false;
  const nutritionOfflineMessage =
    "Nutrition search is offline until nutrition API keys or rate limits are configured.";
  const todayISO = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [log, setLog] = useState<{ totals: any; meals: MealEntry[] }>(() =>
    demo ? { totals: DEMO_NUTRITION_LOG.totals, meals: DEMO_NUTRITION_LOG.meals as MealEntry[] } : { totals: { calories: 0 }, meals: [] }
  );
  const [history7, setHistory7] = useState<NutritionHistoryDay[]>(() => (demo ? DEMO_NUTRITION_HISTORY : []));
  const [loading, setLoading] = useState(!demo);
  const [processing, setProcessing] = useState(false);
  const [recents, setRecents] = useState<RecentItem[]>(() => readRecents());
  const [favorites, setFavorites] = useState<FavoriteDocWithId[]>(() => (demo ? DEMO_FAVORITES : []));
  const [templates, setTemplates] = useState<TemplateDocWithId[]>(() => (demo ? DEMO_TEMPLATES : []));
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorItem, setEditorItem] = useState<FoodItem | null>(null);
  const [editorUnit, setEditorUnit] = useState<ServingUnit>("serving");
  const [editorQty, setEditorQty] = useState<number>(1);

  const refreshLog = useCallback(() => {
    if (demo) {
      setLog({ totals: DEMO_NUTRITION_LOG.totals, meals: DEMO_NUTRITION_LOG.meals as MealEntry[] });
      setLoading(false);
      return;
    }
    setLoading(true);
    getDailyLog(todayISO)
      .then((data: any) => {
        if (!data || typeof data !== "object") {
          setLog({ totals: { calories: 0 }, meals: [] });
          return;
        }
        const totals = typeof data.totals === "object" && data.totals !== null ? data.totals : { calories: 0 };
        const meals = Array.isArray(data.meals) ? data.meals : [];
        setLog({ totals, meals });
      })
      .catch((error) => {
        console.warn("meals.refreshLog", error);
        setLog({ totals: { calories: 0 }, meals: [] });
      })
      .finally(() => setLoading(false));
  }, [demo, todayISO]);

  const refreshHistory = useCallback(() => {
    if (demo) {
      setHistory7(DEMO_NUTRITION_HISTORY);
      return;
    }
    getNutritionHistory(7)
      .then((items) => {
        setHistory7(Array.isArray(items) ? items : []);
      })
      .catch(() => setHistory7([]));
  }, [demo]);

  useEffect(() => {
    refreshLog();
    refreshHistory();
  }, [refreshLog, refreshHistory]);

  useEffect(() => {
    if (demo) {
      setFavorites(DEMO_FAVORITES);
      return;
    }
    if (!uid) {
      setFavorites([]);
      return;
    }
    try {
      const unsub = subscribeFavorites(setFavorites, uid);
      return () => unsub?.();
    } catch (error) {
      console.warn("favorites_subscribe_error", error);
      setFavorites([]);
      return undefined;
    }
  }, [demo, uid]);

  useEffect(() => {
    if (demo) {
      setTemplates(DEMO_TEMPLATES);
      return;
    }
    if (!uid) {
      setTemplates([]);
      return;
    }
    try {
      const unsub = subscribeTemplates(setTemplates, uid);
      return () => unsub?.();
    } catch (error) {
      console.warn("templates_subscribe_error", error);
      setTemplates([]);
      return undefined;
    }
  }, [demo, uid]);

  const updateRecents = useCallback(
    (item: FoodItem) => {
      const next = [item, ...recents.filter((recent) => recent.id !== item.id)].slice(0, MAX_RECENTS);
      setRecents(next);
      storeRecents(next);
    },
    [recents],
  );

  const handleSearchLogged = useCallback(
    (item: FoodItem) => {
      // FIX: Search results previously logged nothing; ensure we sync local state after a successful write.
      updateRecents(item);
      refreshLog();
      refreshHistory();
    },
    [refreshHistory, refreshLog, updateRecents],
  );

  const openEditor = (item: FoodItem, qty = 1, unit: ServingUnit = "serving") => {
    setEditorItem(item);
    setEditorQty(qty);
    setEditorUnit(unit);
    setEditorOpen(true);
  };

  const handleEditorConfirm = async ({ qty, unit, meal }: any) => {
    if (!editorItem) return;
    if (demo) {
      demoToast();
      return;
    }

    setProcessing(true);
    try {
      await addMeal(todayISO, { ...meal, entrySource: "search" });
      toast({ title: "Meal logged", description: `${editorItem.name} added` });
      updateRecents(editorItem);
      refreshLog();
      refreshHistory();
    } catch (error: any) {
      toast({ title: "Unable to log", description: error?.message || "Try again", variant: "destructive" });
    } finally {
      setProcessing(false);
      setEditorOpen(false);
    }
  };

  const handleDelete = async (mealId: string | undefined) => {
    if (!mealId) return;
    if (demo) {
      demoToast();
      return;
    }
    await deleteMeal(todayISO, mealId);
    toast({ title: "Meal removed" });
    refreshLog();
    refreshHistory();
  };

  const copyYesterday = async () => {
    if (demo) {
      demoToast();
      return;
    }
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const prior = await getDailyLog(yesterday);
    if (!prior.meals.length) {
      toast({ title: "No meals yesterday", description: "Nothing to copy." });
      return;
    }
    setProcessing(true);
    try {
      for (const meal of prior.meals) {
        await addMeal(todayISO, { ...meal, id: undefined });
      }
      toast({ title: "Copied", description: "Yesterday's meals added" });
      refreshLog();
      refreshHistory();
    } finally {
      setProcessing(false);
    }
  };

  const saveTodayAsTemplate = async () => {
    if (demo) {
      demoToast();
      return;
    }
    if (!uid) {
      toast({ title: "Sign in required", description: "Sign in to save templates.", variant: "destructive" });
      return;
    }
    const eligible = log.meals.filter((meal) => meal.item && meal.serving?.qty && meal.serving.unit);
    if (!eligible.length) {
      toast({ title: "No template items", description: "Log meals with nutrition data to save templates." });
      return;
    }
    const name = window.prompt("Template name?");
    if (!name) return;
    const items = eligible.map((meal) => ({
      item: normalizedFromSnapshot(meal.item!),
      qty: meal.serving?.qty ?? 1,
      unit: (meal.serving?.unit as ServingUnit) || "serving",
    }));
    try {
      await saveTemplate(null, name, items, uid ?? undefined);
      toast({ title: "Template saved", description: name });
    } catch (error: any) {
      toast({ title: "Unable to save", description: error?.message || "Try again", variant: "destructive" });
    }
  };

  const applyTemplate = async (template: TemplateDocWithId) => {
    if (!template.items?.length) return;
    if (demo) {
      demoToast();
      return;
    }
    if (!uid) {
      toast({ title: "Sign in required", description: "Sign in to apply templates.", variant: "destructive" });
      return;
    }
    setProcessing(true);
    try {
      for (const entry of template.items) {
        const unit = (entry.unit as ServingUnit) || "serving";
        const qty = entry.qty ?? 1;
        const item = entry.item as FoodItem;
        const result = calculateSelection(item, qty, unit);
        const meal = buildMealEntry(item, qty, unit, result, "template");
        await addMeal(todayISO, meal);
        updateRecents(item);
      }
      toast({ title: "Template applied", description: template.name });
      refreshLog();
      refreshHistory();
    } catch (error: any) {
      toast({ title: "Template failed", description: error?.message || "Try again", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (demo) {
      demoToast();
      return;
    }
    if (!uid) {
      toast({ title: "Sign in required", description: "Sign in to manage templates.", variant: "destructive" });
      return;
    }
    try {
      await deleteTemplate(id, uid ?? undefined);
      toast({ title: "Template removed" });
    } catch (error: any) {
      toast({ title: "Delete failed", description: error?.message || "Try again", variant: "destructive" });
    }
  };

  const totalCalories = log.totals.calories || 0;
  const ringProgress = Math.min(1, totalCalories / DAILY_TARGET);
  const ringCircumference = 2 * Math.PI * 54;

  const chartData = history7.map((day) => ({
    date: new Date(day.date).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    calories: day.totals.calories || 0,
    protein: day.totals.protein || 0,
    carbs: day.totals.carbs || 0,
    fat: day.totals.fat || 0,
  }));

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo title="Meals - MyBodyScan" description="Track your daily nutrition" />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <div className="space-y-2 text-center">
          <Utensils className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-3xl font-semibold text-foreground">Today's Meals</h1>
          <p className="text-sm text-muted-foreground">Log foods from search, barcode, favorites, and templates. Macros shown in kcal and US units.</p>
        </div>

        {nutritionUnavailable && (
          <Alert variant="destructive">
            <AlertTitle>Nutrition services offline</AlertTitle>
            <AlertDescription>{nutritionOfflineMessage}</AlertDescription>
          </Alert>
        )}

        <NutritionSearch onMealLogged={handleSearchLogged} />

        <Card>
          <CardHeader>
            <CardTitle>Daily Progress</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-[200px_1fr] md:items-center">
            <div className="flex flex-col items-center justify-center">
              <svg className="h-40 w-40" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="54" strokeWidth="8" className="fill-none stroke-muted" />
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  strokeWidth="8"
                  className="fill-none stroke-primary transition-all"
                  strokeDasharray={`${ringCircumference} ${ringCircumference}`}
                  strokeDashoffset={`${ringCircumference - ringCircumference * ringProgress}`}
                  strokeLinecap="round"
                />
                <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="text-2xl font-semibold fill-foreground">
                  {Math.round(totalCalories)}
                </text>
              </svg>
              <p className="text-xs text-muted-foreground">Target {DAILY_TARGET} kcal</p>
            </div>
            <div className="space-y-3 text-sm">
              <p>
                Protein: <span className="font-medium">{log.totals.protein ?? 0} g</span>
              </p>
              <p>
                Carbs: <span className="font-medium">{log.totals.carbs ?? 0} g</span>
              </p>
              <p>
                Fat: <span className="font-medium">{log.totals.fat ?? 0} g</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {nutritionUnavailable ? (
                  <Button size="sm" disabled title={nutritionOfflineMessage}>
                    <Plus className="mr-1 h-4 w-4" /> Search foods
                  </Button>
                ) : (
                  <Button size="sm" asChild>
                    <a href="/meals/search">
                      <Plus className="mr-1 h-4 w-4" /> Search foods
                    </a>
                  </Button>
                )}
                {nutritionUnavailable ? (
                  <Button size="sm" variant="outline" disabled title={nutritionOfflineMessage}>
                    <Barcode className="mr-1 h-4 w-4" /> Scan barcode
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild>
                    <a href="/barcode">
                      <Barcode className="mr-1 h-4 w-4" /> Scan barcode
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyYesterday}
                  disabled={processing || demo}
                  title={demo ? "Demo mode: sign in to save" : undefined}
                >
                  <Copy className="mr-1 h-4 w-4" /> Copy yesterday
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <a href="/meals/history">
                    <History className="mr-1 h-4 w-4" /> History
                  </a>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>7-day chart</CardTitle>
          </CardHeader>
          <CardContent>{chartData.length ? <NutritionMacrosChart data={chartData} /> : <p className="text-sm text-muted-foreground">No data yet.</p>}</CardContent>
        </Card>

        {favorites.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-yellow-500" /> Favorites
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {favorites.map((fav) => (
                <Button key={fav.id} size="sm" variant="secondary" onClick={() => openEditor(fav.item)}>
                  {fav.item.name}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {recents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListPlus className="h-4 w-4" /> Recents
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {recents.slice(0, 8).map((item) => (
                <Button key={item.id} variant="outline" size="sm" onClick={() => openEditor(item)}>
                  {item.name}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {templates.length > 0 && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListPlus className="h-4 w-4" /> Templates
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={saveTodayAsTemplate}
                disabled={demo}
                title={demo ? "Demo mode: sign in to save" : undefined}
              >
                Save today
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {templates.map((template) => (
                <div key={template.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-medium text-foreground">{template.name}</p>
                    <p className="text-xs text-muted-foreground">{template.items?.length ?? 0} items</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => applyTemplate(template)}
                      disabled={processing || demo}
                      title={demo ? "Demo mode: sign in to save" : undefined}
                    >
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteTemplate(template.id)}
                      disabled={demo}
                      title={demo ? "Demo mode: sign in to save" : undefined}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {templates.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Templates</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">Save recurring meals and apply them in one tap.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={saveTodayAsTemplate}
                disabled={demo}
                title={demo ? "Demo mode: sign in to save" : undefined}
              >
                Save today as template
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Logged meals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Loading meals…</p>}
            {!loading && !log.meals.length && <p className="text-sm text-muted-foreground">No meals logged yet. Start with search or barcode.</p>}
            {log.meals.map((meal) => {
              const item = meal.item ? normalizedFromSnapshot(meal.item) : null;
              const qty = meal.serving?.qty ?? 1;
              const unit = (meal.serving?.unit as ServingUnit) || "serving";
              const qtyDisplay =
                typeof meal.serving?.qty === "number" ? formatServingQuantity(meal.serving.qty) : null;
              const unitLabel = typeof meal.serving?.unit === "string" ? meal.serving.unit : null;
              return (
                <Card key={meal.id || meal.name} className="border">
                  <CardContent className="flex flex-col gap-2 py-4 text-sm md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-foreground">{meal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {meal.calories ?? "—"} kcal • {meal.protein ?? 0}g P • {meal.carbs ?? 0}g C • {meal.fat ?? 0}g F
                      </p>
                      {(qtyDisplay || unitLabel || meal.serving?.grams) && (
                        <p className="text-xs text-muted-foreground">
                          {qtyDisplay && unitLabel ? `${qtyDisplay} × ${unitLabel}` : qtyDisplay || unitLabel || ""}
                          {meal.serving?.grams ? ` · approx ${Math.round(meal.serving.grams)} g` : ""}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openEditor(item, qty, unit)}
                          disabled={demo}
                          title={demo ? "Demo mode: sign in to save" : undefined}
                        >
                          Edit
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => meal.id && handleDelete(meal.id)}
                        disabled={demo}
                        title={demo ? "Demo mode: sign in to save" : undefined}
                      >
                        Remove
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>
      </main>
      <BottomNav />

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editorItem ? `Log ${editorItem.name}` : "Log food"}</DialogTitle>
          </DialogHeader>
          {editorItem && (
            <ServingEditor
              item={editorItem}
              defaultQty={editorQty}
              defaultUnit={editorUnit}
              onConfirm={handleEditorConfirm}
              busy={processing}
              entrySource="manual"
              readOnly={demo}
              onDemoAttempt={demoToast}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
