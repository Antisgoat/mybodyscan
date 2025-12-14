import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Utensils,
  Plus,
  History,
  Copy,
  Barcode,
  ListPlus,
  Star,
  Trash,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoToast } from "@/lib/demoToast";
import {
  DEMO_FAVORITES,
  DEMO_NUTRITION_HISTORY,
  DEMO_NUTRITION_LOG,
  DEMO_TEMPLATES,
} from "@/lib/demoContent";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NutritionMacrosChart } from "@/components/charts/NutritionMacrosChart";
import NutritionSearch from "@/features/meals/NutritionSearch";
import { useAuthUser } from "@/lib/useAuthUser";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { useUnits } from "@/hooks/useUnits";
import { gramsToOunces, roundGrams } from "@/lib/nutritionMath";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUserProfile } from "@/hooks/useUserProfile";

const RECENTS_KEY = "mbs_nutrition_recents_v3";
const MAX_RECENTS = 50;
const DEFAULT_DAILY_TARGET = 2200;

type RecentItem = FoodItem;

type DiaryMealType = "breakfast" | "lunch" | "dinner" | "snacks";
const MEAL_TYPES: DiaryMealType[] = ["breakfast", "lunch", "dinner", "snacks"];
const MEAL_LABELS: Record<DiaryMealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

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
  window.localStorage.setItem(
    RECENTS_KEY,
    JSON.stringify(items.slice(0, MAX_RECENTS))
  );
}

function formatServingQuantity(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toString();
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toLocalISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toMealType(value: unknown): DiaryMealType {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (v === "breakfast" || v === "lunch" || v === "dinner" || v === "snacks") {
    return v;
  }
  return "snacks";
}

export default function Meals() {
  const demo = useDemoMode();
  const { user, authReady } = useAuthUser();
  const { units } = useUnits();
  const { plan } = useUserProfile();
  const uid = authReady ? (user?.uid ?? null) : null;
  const { health: systemHealth } = useSystemHealth();
  const { nutritionConfigured } = computeFeatureStatuses(
    systemHealth ?? undefined
  );
  const nutritionUnavailable = nutritionConfigured === false;
  const nutritionOfflineMessage =
    "Nutrition search is offline until nutrition API keys or rate limits are configured.";
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const dateISO = useMemo(() => toLocalISODate(selectedDate), [selectedDate]);
  const [log, setLog] = useState<{ totals: any; meals: MealEntry[] }>(() =>
    demo
      ? {
          totals: DEMO_NUTRITION_LOG.totals,
          meals: DEMO_NUTRITION_LOG.meals as MealEntry[],
        }
      : { totals: { calories: 0 }, meals: [] }
  );
  const [history7, setHistory7] = useState<NutritionHistoryDay[]>(() =>
    demo ? DEMO_NUTRITION_HISTORY : []
  );
  const [loading, setLoading] = useState(!demo);
  const [processing, setProcessing] = useState(false);
  const [recents, setRecents] = useState<RecentItem[]>(() => readRecents());
  const [favorites, setFavorites] = useState<FavoriteDocWithId[]>(() =>
    demo ? DEMO_FAVORITES : []
  );
  const [templates, setTemplates] = useState<TemplateDocWithId[]>(() =>
    demo ? DEMO_TEMPLATES : []
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorItem, setEditorItem] = useState<FoodItem | null>(null);
  const [editorUnit, setEditorUnit] = useState<ServingUnit>("serving");
  const [editorQty, setEditorQty] = useState<number>(1);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addMealType, setAddMealType] = useState<DiaryMealType>("snacks");
  const [highlightMealId, setHighlightMealId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddType, setQuickAddType] = useState<DiaryMealType>("snacks");
  const [quickCalories, setQuickCalories] = useState<string>("");
  const [quickProtein, setQuickProtein] = useState<string>("");
  const [quickCarbs, setQuickCarbs] = useState<string>("");
  const [quickFat, setQuickFat] = useState<string>("");
  const highlightRef = useRef<string | null>(null);

  const refreshLog = useCallback(() => {
    if (demo) {
      setLog({
        totals: DEMO_NUTRITION_LOG.totals,
        meals: DEMO_NUTRITION_LOG.meals as MealEntry[],
      });
      setLoading(false);
      return;
    }
    setLoading(true);
    getDailyLog(dateISO)
      .then((data: any) => {
        if (!data || typeof data !== "object") {
          setLog({ totals: { calories: 0 }, meals: [] });
          return;
        }
        const totals =
          typeof data.totals === "object" && data.totals !== null
            ? data.totals
            : { calories: 0 };
        const meals = Array.isArray(data.meals) ? data.meals : [];
        setLog({ totals, meals });
      })
      .catch((error) => {
        console.warn("meals.refreshLog", error);
        setLog({ totals: { calories: 0 }, meals: [] });
      })
      .finally(() => setLoading(false));
  }, [demo, dateISO]);

  const refreshHistory = useCallback(() => {
    if (demo) {
      setHistory7(DEMO_NUTRITION_HISTORY);
      return;
    }
    getNutritionHistory(7, dateISO)
      .then((items) => {
        setHistory7(Array.isArray(items) ? items : []);
      })
      .catch(() => setHistory7([]));
  }, [demo, dateISO]);

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
      const next = [
        item,
        ...recents.filter((recent) => recent.id !== item.id),
      ].slice(0, MAX_RECENTS);
      setRecents(next);
      storeRecents(next);
    },
    [recents]
  );

  const handleSearchLogged = useCallback(
    (item: FoodItem) => {
      // FIX: Search results previously logged nothing; ensure we sync local state after a successful write.
      updateRecents(item);
      refreshLog();
      refreshHistory();
    },
    [refreshHistory, refreshLog, updateRecents]
  );

  const applyAddResult = useCallback(
    (payload: { meal?: MealEntry; totals?: any } | null | undefined) => {
      if (!payload || typeof payload !== "object") return;
      const meal = payload.meal as MealEntry | undefined;
      const totals = payload.totals;
      if (totals && typeof totals === "object") {
        setLog((prev) => ({ ...prev, totals }));
      }
      if (meal && typeof meal === "object") {
        setLog((prev) => {
          const existing = Array.isArray(prev.meals) ? [...prev.meals] : [];
          const idx = meal.id ? existing.findIndex((m) => m.id === meal.id) : -1;
          if (idx >= 0) {
            existing[idx] = meal;
          } else {
            existing.push(meal);
          }
          return { ...prev, meals: existing };
        });
        if (typeof meal.id === "string" && meal.id) {
          setHighlightMealId(meal.id);
          highlightRef.current = meal.id;
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!highlightMealId) return;
    const el = document.getElementById(`meal-${highlightMealId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const t = setTimeout(() => {
      setHighlightMealId((prev) => (prev === highlightMealId ? null : prev));
    }, 2500);
    return () => clearTimeout(t);
  }, [highlightMealId]);

  const openEditor = (
    item: FoodItem,
    qty = 1,
    unit: ServingUnit = "serving"
  ) => {
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
      const result = await addMeal(dateISO, { ...meal, entrySource: "search" });
      toast({ title: "Meal logged", description: `${editorItem.name} added` });
      updateRecents(editorItem);
      applyAddResult(result);
      refreshHistory();
    } catch (error: any) {
      toast({
        title: "Unable to log",
        description: error?.message || "Try again",
        variant: "destructive",
      });
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
    setProcessing(true);
    try {
      const result = await deleteMeal(dateISO, mealId);
      toast({ title: "Meal removed" });
      setLog((prev) => ({
        ...prev,
        meals: (prev.meals ?? []).filter((m) => m.id !== mealId),
        totals: (result as any)?.totals ?? prev.totals,
      }));
      refreshHistory();
    } catch (error: any) {
      toast({
        title: "Unable to delete meal",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const copyYesterday = async () => {
    if (demo) {
      demoToast();
      return;
    }
    try {
      const yesterdayDate = new Date(selectedDate);
      yesterdayDate.setDate(yesterdayDate.getDate() - 1);
      const yesterday = toLocalISODate(yesterdayDate);
      const prior = await getDailyLog(yesterday);
      if (!prior.meals.length) {
        toast({ title: "No meals yesterday", description: "Nothing to copy." });
        return;
      }
      setProcessing(true);
      for (const meal of prior.meals) {
        await addMeal(dateISO, { ...meal, id: undefined });
      }
      toast({ title: "Copied", description: "Yesterday's meals added" });
      refreshLog();
      refreshHistory();
    } catch (error: any) {
      toast({
        title: "Copy failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const openAddDialog = (type: DiaryMealType) => {
    setAddMealType(type);
    setAddDialogOpen(true);
  };

  const submitQuickAdd = async () => {
    if (demo) {
      demoToast();
      return;
    }
    const calories = safeNumber(quickCalories);
    const protein = safeNumber(quickProtein);
    const carbs = safeNumber(quickCarbs);
    const fat = safeNumber(quickFat);
    if (calories <= 0 && protein <= 0 && carbs <= 0 && fat <= 0) {
      toast({
        title: "Enter at least calories",
        description: "Calories are required for quick add.",
        variant: "destructive",
      });
      return;
    }
    setProcessing(true);
    try {
      const id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `meal-${Math.random().toString(36).slice(2, 10)}`;
      const result = await addMeal(dateISO, {
        id,
        name: "Quick add",
        mealType: quickAddType,
        calories: calories > 0 ? calories : undefined,
        protein: protein > 0 ? protein : undefined,
        carbs: carbs > 0 ? carbs : undefined,
        fat: fat > 0 ? fat : undefined,
        entrySource: "quick_add",
      });
      applyAddResult(result);
      refreshHistory();
      toast({ title: "Added", description: "Quick add saved to Diary." });
      setQuickAddOpen(false);
      setQuickCalories("");
      setQuickProtein("");
      setQuickCarbs("");
      setQuickFat("");
      setQuickAddType("snacks");
    } catch (error: any) {
      toast({
        title: "Quick add failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
    }
  };

  const mealsByType = useMemo(() => {
    const grouped: Record<DiaryMealType, MealEntry[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snacks: [],
    };
    const meals = Array.isArray(log.meals) ? log.meals : [];
    for (const meal of meals) {
      grouped[toMealType((meal as any)?.mealType)].push(meal);
    }
    return grouped;
  }, [log.meals]);

  const saveTodayAsTemplate = async () => {
    if (demo) {
      demoToast();
      return;
    }
    if (!uid) {
      toast({
        title: "Sign in required",
        description: "Sign in to save templates.",
        variant: "destructive",
      });
      return;
    }
    const eligible = log.meals.filter(
      (meal) => meal.item && meal.serving?.qty && meal.serving.unit
    );
    if (!eligible.length) {
      toast({
        title: "No template items",
        description: "Log meals with nutrition data to save templates.",
      });
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
      toast({
        title: "Unable to save",
        description: error?.message || "Try again",
        variant: "destructive",
      });
    }
  };

  const applyTemplate = async (template: TemplateDocWithId) => {
    if (!template.items?.length) return;
    if (demo) {
      demoToast();
      return;
    }
    if (!uid) {
      toast({
        title: "Sign in required",
        description: "Sign in to apply templates.",
        variant: "destructive",
      });
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
        await addMeal(dateISO, meal);
        updateRecents(item);
      }
      toast({ title: "Template applied", description: template.name });
      refreshLog();
      refreshHistory();
    } catch (error: any) {
      toast({
        title: "Template failed",
        description: error?.message || "Try again",
        variant: "destructive",
      });
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
      toast({
        title: "Sign in required",
        description: "Sign in to manage templates.",
        variant: "destructive",
      });
      return;
    }
    try {
      await deleteTemplate(id, uid ?? undefined);
      toast({ title: "Template removed" });
    } catch (error: any) {
      toast({
        title: "Delete failed",
        description: error?.message || "Try again",
        variant: "destructive",
      });
    }
  };

  const targetCalories =
    typeof plan?.calorieTarget === "number" && Number.isFinite(plan.calorieTarget)
      ? plan.calorieTarget
      : DEFAULT_DAILY_TARGET;
  const targetProtein =
    typeof plan?.proteinFloor === "number" && Number.isFinite(plan.proteinFloor)
      ? plan.proteinFloor
      : 140;
  // Derive carb/fat targets when explicit targets aren't stored yet.
  const targetFat = Math.max(0, Math.round((targetCalories * 0.25) / 9));
  const targetCarbs = Math.max(
    0,
    Math.round((targetCalories - targetProtein * 4 - targetFat * 9) / 4)
  );

  const consumedCalories = safeNumber(log.totals?.calories);
  const consumedProtein = safeNumber(log.totals?.protein);
  const consumedCarbs = safeNumber(log.totals?.carbs);
  const consumedFat = safeNumber(log.totals?.fat);
  const exerciseCalories = 0;
  const remainingCalories = Math.round(
    Math.max(0, targetCalories - consumedCalories + exerciseCalories)
  );

  const ringProgress = Math.min(
    1,
    targetCalories > 0 ? consumedCalories / targetCalories : 0
  );
  const ringCircumference = 2 * Math.PI * 54;

  const chartData = history7.map((day) => ({
    date: new Date(day.date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    calories: day.totals.calories || 0,
    protein: day.totals.protein || 0,
    carbs: day.totals.carbs || 0,
    fat: day.totals.fat || 0,
  }));

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo
        title="Meals - MyBodyScan"
        description="Track your daily nutrition"
      />
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <div className="space-y-2 text-center">
          <Utensils className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-3xl font-semibold text-foreground">
            Diary
          </h1>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(d);
              }}
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="font-medium text-foreground">{dateISO}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                setSelectedDate(d);
              }}
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSelectedDate(new Date())}
            >
              Today
            </Button>
          </div>
        </div>

        {nutritionUnavailable && (
          <Alert variant="destructive">
            <AlertTitle>Nutrition services offline</AlertTitle>
            <AlertDescription>{nutritionOfflineMessage}</AlertDescription>
          </Alert>
        )}

        <Card className="border bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Today</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQuickAddOpen(true);
                  setQuickAddType("snacks");
                }}
                disabled={processing || demo}
                title={demo ? "Demo mode: sign in to save" : undefined}
              >
                <Plus className="mr-1 h-4 w-4" /> Quick add
              </Button>
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
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Calories remaining
              </div>
              <div className="mt-1 text-3xl font-semibold">
                {remainingCalories.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Goal {targetCalories.toLocaleString()} - Food{" "}
                {Math.round(consumedCalories).toLocaleString()} + Exercise{" "}
                {exerciseCalories} = Remaining{" "}
                {remainingCalories.toLocaleString()}
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, ringProgress * 100))}%`,
                  }}
                />
              </div>
            </div>
            <div className="rounded-md border p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Macros
              </div>
              <div className="mt-2 grid gap-2 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>Protein</span>
                  <span>
                    {Math.round(consumedProtein)} / {Math.round(targetProtein)} g
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary/80 transition-all"
                    style={{
                      width: `${
                        targetProtein > 0
                          ? Math.min(100, (consumedProtein / targetProtein) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Carbs</span>
                  <span>
                    {Math.round(consumedCarbs)} / {Math.round(targetCarbs)} g
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary/80 transition-all"
                    style={{
                      width: `${
                        targetCarbs > 0
                          ? Math.min(100, (consumedCarbs / targetCarbs) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span>Fat</span>
                  <span>
                    {Math.round(consumedFat)} / {Math.round(targetFat)} g
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-primary/80 transition-all"
                    style={{
                      width: `${
                        targetFat > 0
                          ? Math.min(100, (consumedFat / targetFat) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
              <div className="mt-2 text-[11px] text-muted-foreground">
                Units: {units === "metric" ? "Metric" : "US"}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {MEAL_TYPES.map((type) => {
            const items = mealsByType[type] ?? [];
            const mealCalories = Math.round(
              items.reduce((sum, meal) => sum + safeNumber((meal as any)?.calories), 0)
            );
            return (
              <Card key={type} className="border bg-card/60">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">
                    {MEAL_LABELS[type]}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      • {mealCalories} kcal
                    </span>
                  </CardTitle>
                  <Button
                    size="sm"
                    onClick={() => openAddDialog(type)}
                    disabled={processing || demo || nutritionUnavailable}
                    title={
                      nutritionUnavailable
                        ? nutritionOfflineMessage
                        : demo
                          ? "Demo mode: sign in to save"
                          : undefined
                    }
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add food
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {!items.length && (
                    <p className="text-sm text-muted-foreground">
                      No items yet.
                    </p>
                  )}
                  {items.map((meal) => {
                    const id = meal.id || `${meal.name}-${Math.random()}`;
                    const isHighlighted = highlightMealId === meal.id;
                    const grams =
                      typeof meal.serving?.grams === "number"
                        ? meal.serving.grams
                        : null;
                    const gramsText =
                      grams != null
                        ? units === "metric"
                          ? `${roundGrams(grams)} g`
                          : `${gramsToOunces(grams) ?? "?"} oz`
                        : null;
                    const qtyDisplay =
                      typeof meal.serving?.qty === "number"
                        ? formatServingQuantity(meal.serving.qty)
                        : null;
                    const unitLabel =
                      typeof meal.serving?.unit === "string"
                        ? meal.serving.unit
                        : null;
                    const servingText =
                      qtyDisplay && unitLabel
                        ? `${qtyDisplay} × ${unitLabel}`
                        : qtyDisplay || unitLabel || "";
                    return (
                      <div
                        key={id}
                        id={meal.id ? `meal-${meal.id}` : undefined}
                        className={`flex items-center justify-between gap-3 rounded-md border p-3 ${
                          isHighlighted ? "border-primary bg-primary/5" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-foreground">
                            {meal.name || "Meal"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {Math.round(safeNumber(meal.calories))} kcal · P{" "}
                            {Math.round(safeNumber(meal.protein))}g · C{" "}
                            {Math.round(safeNumber(meal.carbs))}g · F{" "}
                            {Math.round(safeNumber(meal.fat))}g
                          </div>
                          {(servingText || gramsText) && (
                            <div className="text-[11px] text-muted-foreground">
                              {servingText}
                              {servingText && gramsText ? " · " : ""}
                              {gramsText}
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => meal.id && handleDelete(meal.id)}
                          disabled={processing || demo}
                          title={demo ? "Demo mode: sign in to save" : undefined}
                        >
                          Remove
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Daily Progress</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6 md:grid-cols-[200px_1fr] md:items-center">
            <div className="flex flex-col items-center justify-center">
              <svg className="h-40 w-40" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="54"
                  strokeWidth="8"
                  className="fill-none stroke-muted"
                />
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
                <text
                  x="60"
                  y="60"
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="text-2xl font-semibold fill-foreground"
                >
                  {Math.round(consumedCalories)}
                </text>
              </svg>
              <p className="text-xs text-muted-foreground">
                Target {targetCalories} kcal
              </p>
            </div>
            <div className="space-y-3 text-sm">
              <p>
                Protein:{" "}
                <span className="font-medium">
                  {Math.round(consumedProtein)} g
                </span>
              </p>
              <p>
                Carbs:{" "}
                <span className="font-medium">{Math.round(consumedCarbs)} g</span>
              </p>
              <p>
                Fat:{" "}
                <span className="font-medium">{Math.round(consumedFat)} g</span>
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
                  <Button
                    size="sm"
                    variant="outline"
                    disabled
                    title={nutritionOfflineMessage}
                  >
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
                  onClick={() => openAddDialog("snacks")}
                  disabled={processing || demo || nutritionUnavailable}
                  title={
                    nutritionUnavailable
                      ? nutritionOfflineMessage
                      : demo
                        ? "Demo mode: sign in to save"
                        : undefined
                  }
                >
                  <Plus className="mr-1 h-4 w-4" /> Search + add
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
          <CardContent>
            {chartData.length ? (
              <NutritionMacrosChart data={chartData} />
            ) : (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            )}
          </CardContent>
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
                <Button
                  key={fav.id}
                  size="sm"
                  variant="secondary"
                  onClick={() => openEditor(fav.item)}
                >
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
                <Button
                  key={item.id}
                  variant="outline"
                  size="sm"
                  onClick={() => openEditor(item)}
                >
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
                <div
                  key={template.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {template.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {template.items?.length ?? 0} items
                    </p>
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
              <p className="text-muted-foreground">
                Save recurring meals and apply them in one tap.
              </p>
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
            {loading && (
              <p className="text-sm text-muted-foreground">Loading meals…</p>
            )}
            {!loading && !log.meals.length && (
              <p className="text-sm text-muted-foreground">
                No meals logged yet. Start with search or barcode.
              </p>
            )}
            {log.meals.map((meal) => {
              const item = meal.item ? normalizedFromSnapshot(meal.item) : null;
              const qty = meal.serving?.qty ?? 1;
              const unit = (meal.serving?.unit as ServingUnit) || "serving";
              const qtyDisplay =
                typeof meal.serving?.qty === "number"
                  ? formatServingQuantity(meal.serving.qty)
                  : null;
              const unitLabel =
                typeof meal.serving?.unit === "string"
                  ? meal.serving.unit
                  : null;
              return (
                <Card key={meal.id || meal.name} className="border">
                  <CardContent className="flex flex-col gap-2 py-4 text-sm md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-medium text-foreground">{meal.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {meal.calories ?? "—"} kcal • {meal.protein ?? 0}g P •{" "}
                        {meal.carbs ?? 0}g C • {meal.fat ?? 0}g F
                      </p>
                      {(qtyDisplay || unitLabel || meal.serving?.grams) && (
                        <p className="text-xs text-muted-foreground">
                          {qtyDisplay && unitLabel
                            ? `${qtyDisplay} × ${unitLabel}`
                            : qtyDisplay || unitLabel || ""}
                          {meal.serving?.grams
                            ? ` · approx ${Math.round(meal.serving.grams)} g`
                            : ""}
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
                          title={
                            demo ? "Demo mode: sign in to save" : undefined
                          }
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
            <DialogTitle>
              {editorItem ? `Log ${editorItem.name}` : "Log food"}
            </DialogTitle>
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

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add to {MEAL_LABELS[addMealType]}</DialogTitle>
          </DialogHeader>
          <NutritionSearch
            defaultMealType={addMealType}
            onMealLogged={handleSearchLogged}
            onMealAdded={(payload) => {
              applyAddResult(payload);
              setAddDialogOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={quickAddOpen} onOpenChange={setQuickAddOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quick add</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="qa-type">Meal</Label>
                <select
                  id="qa-type"
                  value={quickAddType}
                  onChange={(e) => setQuickAddType(toMealType(e.target.value))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                >
                  {MEAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {MEAL_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="qa-calories">Calories</Label>
                <Input
                  id="qa-calories"
                  inputMode="numeric"
                  value={quickCalories}
                  onChange={(e) => setQuickCalories(e.target.value)}
                  placeholder="e.g. 450"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="qa-protein">Protein (g)</Label>
                <Input
                  id="qa-protein"
                  inputMode="numeric"
                  value={quickProtein}
                  onChange={(e) => setQuickProtein(e.target.value)}
                  placeholder="optional"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="qa-carbs">Carbs (g)</Label>
                <Input
                  id="qa-carbs"
                  inputMode="numeric"
                  value={quickCarbs}
                  onChange={(e) => setQuickCarbs(e.target.value)}
                  placeholder="optional"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="qa-fat">Fat (g)</Label>
                <Input
                  id="qa-fat"
                  inputMode="numeric"
                  value={quickFat}
                  onChange={(e) => setQuickFat(e.target.value)}
                  placeholder="optional"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setQuickAddOpen(false)}
                disabled={processing}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={submitQuickAdd}
                disabled={processing || demo}
                title={demo ? "Demo mode: sign in to save" : undefined}
              >
                {processing ? "Adding…" : "Add"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
