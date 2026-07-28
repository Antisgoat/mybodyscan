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
  CalendarDays,
  BookOpen,
} from "lucide-react";
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
  normalizeDailyTotals,
  type MealEntry,
  type NutritionHistoryDay,
} from "@/lib/nutritionBackend";
import type { FoodItem } from "@/lib/nutrition/types";
import {
  subscribeFavorites,
  subscribeTemplates,
  saveTemplate,
  deleteTemplate,
  subscribeCustomFoods,
  subscribeRecipes,
  type FavoriteDocWithId,
  type TemplateDocWithId,
  type CustomFoodDocWithId,
  type RecipeDocWithId,
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
import { deriveNutritionGoals } from "@/lib/nutritionGoals";
import {
  subscribeActiveWeeklyReview,
  type WeeklyReviewDocument,
} from "@/lib/weeklyReview";

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
  const { plan, profile } = useUserProfile();
  const uid = authReady ? (user?.uid ?? null) : null;
  const { health: systemHealth } = useSystemHealth();
  const { nutritionConfigured } = computeFeatureStatuses(
    systemHealth ?? undefined
  );
  const nutritionUnavailable = nutritionConfigured === false;
  const nutritionOfflineMessage =
    "Backend unavailable (Cloud Functions). Check deployment / network.";
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
  const [processing, setProcessing] = useState(false);
  const [recents, setRecents] = useState<RecentItem[]>(() => readRecents());
  const [favorites, setFavorites] = useState<FavoriteDocWithId[]>(() =>
    demo ? DEMO_FAVORITES : []
  );
  const [templates, setTemplates] = useState<TemplateDocWithId[]>(() =>
    demo ? DEMO_TEMPLATES : []
  );
  const [customFoods, setCustomFoods] = useState<CustomFoodDocWithId[]>([]);
  const [recipes, setRecipes] = useState<RecipeDocWithId[]>([]);
  const [activeWeeklyReview, setActiveWeeklyReview] =
    useState<WeeklyReviewDocument | null>(null);
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
      return;
    }
    getDailyLog(dateISO)
      .then((data: any) => {
        if (!data || typeof data !== "object") {
          setLog({ totals: { calories: 0 }, meals: [] });
          return;
        }
        const totals = normalizeDailyTotals(data.totals);
        const meals = Array.isArray(data.meals) ? data.meals : [];
        setLog({ totals, meals });
      })
      .catch((error) => {
        console.warn("meals.refreshLog", error);
        setLog({ totals: normalizeDailyTotals(null), meals: [] });
      });
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
    if (demo || !uid) {
      setCustomFoods([]);
      setRecipes([]);
      setActiveWeeklyReview(null);
      return;
    }
    const unsubscribers = [
      subscribeCustomFoods(setCustomFoods, uid),
      subscribeRecipes(setRecipes, uid),
      subscribeActiveWeeklyReview(uid, setActiveWeeklyReview),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
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
        setLog((prev) => ({ ...prev, totals: normalizeDailyTotals(totals) }));
      }
      if (meal && typeof meal === "object") {
        setLog((prev) => {
          const existing = Array.isArray(prev.meals) ? [...prev.meals] : [];
          const idx = meal.id
            ? existing.findIndex((m) => m.id === meal.id)
            : -1;
          if (idx >= 0) {
            existing[idx] = meal;
          } else {
            existing.push(meal);
          }
          return {
            ...prev,
            meals: existing,
            totals: normalizeDailyTotals(prev.totals),
          };
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
        totals: normalizeDailyTotals((result as any)?.totals ?? prev.totals),
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

  const computedGoals = useMemo(() => {
    // Use persisted plan targets when available, but always derive a full macro set
    // (carbs/fat) deterministically so all pages agree.
    const overrides: { calories?: number; proteinGrams?: number } = {};
    if (
      typeof plan?.calorieTarget === "number" &&
      Number.isFinite(plan.calorieTarget)
    ) {
      overrides.calories = plan.calorieTarget;
    }
    if (
      typeof plan?.proteinFloor === "number" &&
      Number.isFinite(plan.proteinFloor)
    ) {
      overrides.proteinGrams = plan.proteinFloor;
    }
    return deriveNutritionGoals({
      weightKg: profile?.weight_kg ?? null,
      heightCm: profile?.height_cm ?? null,
      age: profile?.age ?? null,
      sex: profile?.sex ?? null,
      goalWeightKg: undefined,
      goal:
        profile?.goal === "lose_fat"
          ? "lose_fat"
          : profile?.goal === "gain_muscle"
            ? "gain_muscle"
            : null,
      activityLevel: profile?.activity_level ?? null,
      overrides,
    });
  }, [
    plan?.calorieTarget,
    plan?.proteinFloor,
    profile?.activity_level,
    profile?.goal,
    profile?.weight_kg,
  ]);

  const weeklyCalorieDelta =
    activeWeeklyReview?.status === "accepted" &&
    Number.isFinite(activeWeeklyReview.activeCalorieDelta)
      ? Number(activeWeeklyReview.activeCalorieDelta)
      : 0;
  const targetCalories = Math.max(
    1200,
    (computedGoals.calories || DEFAULT_DAILY_TARGET) + weeklyCalorieDelta
  );
  const targetProtein = computedGoals.proteinGrams || 140;
  const targetCarbs = computedGoals.carbsGrams || 0;
  const targetFat = computedGoals.fatGrams || 0;

  const normalizedTotals = normalizeDailyTotals(log.totals);
  const consumedCalories = safeNumber(normalizedTotals.calories);
  const consumedProtein = safeNumber(normalizedTotals.protein);
  const consumedCarbs = safeNumber(normalizedTotals.carbs);
  const consumedFat = safeNumber(normalizedTotals.fat);
  const exerciseCalories = 0;
  const remainingCalories = Math.round(
    Math.max(0, targetCalories - consumedCalories + exerciseCalories)
  );

  const ringProgress = Math.min(
    1,
    targetCalories > 0 ? consumedCalories / targetCalories : 0
  );
  const chartData = history7.map((day) => ({
    date: new Date(day.date).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    calories: normalizeDailyTotals(day.totals).calories || 0,
    protein: normalizeDailyTotals(day.totals).protein || 0,
    carbs: normalizeDailyTotals(day.totals).carbs || 0,
    fat: normalizeDailyTotals(day.totals).fat || 0,
  }));

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo
        title="Meals - MyBodyScan"
        description="Track your daily nutrition"
      />
      <main className="mx-auto flex max-w-5xl flex-col gap-4 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
        <section className="space-y-4" aria-labelledby="nutrition-heading">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                Nutrition
              </p>
              <h1
                id="nutrition-heading"
                className="mt-1 text-[1.75rem] font-semibold leading-tight text-foreground sm:text-3xl"
              >
                Food diary
              </h1>
              <p className="mt-1 text-sm leading-5 text-muted-foreground">
                Log meals and keep today&apos;s targets easy to read.
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Utensils className="h-6 w-6" aria-hidden="true" />
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-xl border bg-card p-1.5 shadow-sm">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() - 1);
                setSelectedDate(d);
              }}
              aria-label="Previous day"
              className="h-10 w-10 shrink-0"
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1 text-center">
              <p className="truncate text-sm font-semibold text-foreground">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </p>
              <p className="text-[11px] leading-4 text-muted-foreground">
                {dateISO}
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => {
                const d = new Date(selectedDate);
                d.setDate(d.getDate() + 1);
                setSelectedDate(d);
              }}
              aria-label="Next day"
              className="h-10 w-10 shrink-0"
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setSelectedDate(new Date())}
              className="h-9 shrink-0 px-3 text-xs"
            >
              Today
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              className="h-11 justify-start px-3 text-[13px]"
              asChild
            >
              <a href="/meals/search">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Search foods
              </a>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-11 justify-start px-3 text-[13px]"
              asChild
            >
              <a href="/barcode">
                <Barcode className="mr-2 h-4 w-4" aria-hidden="true" />
                Scan barcode
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 justify-start px-3 text-[13px]"
              asChild
            >
              <a href="/meals/plan">
                <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
                Meal plan
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-11 justify-start px-3 text-[13px]"
              asChild
            >
              <a href="/meals/my-foods">
                <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />
                My foods
              </a>
            </Button>
          </div>
        </section>

        {nutritionUnavailable && (
          <Alert variant="destructive">
            <AlertTitle>Nutrition services offline</AlertTitle>
            <AlertDescription>{nutritionOfflineMessage}</AlertDescription>
          </Alert>
        )}

        <Card className="overflow-hidden border bg-card shadow-sm">
          <CardHeader className="space-y-3 px-4 pb-3 pt-4 sm:px-6 sm:pt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">Daily summary</CardTitle>
                <p className="mt-0.5 text-xs leading-4 text-muted-foreground">
                  Food minus activity against your daily goal
                </p>
              </div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
                {units === "metric" ? "Metric" : "US units"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setQuickAddOpen(true);
                  setQuickAddType("snacks");
                }}
                disabled={processing || demo}
                title={demo ? "Demo mode: sign in to save" : undefined}
                className="h-10 px-2 text-xs"
              >
                <Plus className="mr-1 h-4 w-4" /> Quick add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={copyYesterday}
                disabled={processing || demo}
                title={demo ? "Demo mode: sign in to save" : undefined}
                className="h-10 px-2 text-xs"
              >
                <Copy className="mr-1 h-4 w-4" /> Copy day
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-10 px-2 text-xs"
                asChild
              >
                <a href="/meals/history">
                  <History className="mr-1 h-4 w-4" /> History
                </a>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5 px-4 pb-5 sm:px-6 sm:pb-6">
            <div className="rounded-xl bg-secondary/65 px-4 py-5 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Calories remaining
              </p>
              <p className="mt-1 text-4xl font-semibold leading-none tabular-nums text-foreground">
                {remainingCalories.toLocaleString()}
              </p>
              <div className="mt-5 grid grid-cols-3 divide-x divide-border">
                <div className="px-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Goal
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {targetCalories.toLocaleString()}
                  </p>
                </div>
                <div className="px-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Food
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {Math.round(consumedCalories).toLocaleString()}
                  </p>
                </div>
                <div className="px-1">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Activity
                  </p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                    {exerciseCalories.toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{
                    width: `${Math.min(100, Math.max(0, ringProgress * 100))}%`,
                  }}
                  role="progressbar"
                  aria-label="Daily calorie progress"
                  aria-valuemin={0}
                  aria-valuemax={targetCalories}
                  aria-valuenow={Math.round(consumedCalories)}
                />
              </div>
              {weeklyCalorieDelta !== 0 ? (
                <div className="mt-3 rounded-lg bg-background px-3 py-2 text-xs leading-5 text-primary">
                  Weekly review: {weeklyCalorieDelta > 0 ? "+" : ""}
                  {weeklyCalorieDelta} kcal/day.{" "}
                  <a className="underline" href="/weekly-review">
                    Review or undo
                  </a>
                </div>
              ) : null}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  Macros
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Consumed / goal
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="min-w-0 rounded-xl border bg-background p-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Protein
                  </p>
                  <p className="mt-1 text-base font-semibold leading-none tabular-nums text-foreground">
                    {Math.round(consumedProtein)}g
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                    of {Math.round(targetProtein)}g goal
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${
                          targetProtein > 0
                            ? Math.min(
                                100,
                                (consumedProtein / targetProtein) * 100
                              )
                            : 0
                        }%`,
                      }}
                      role="progressbar"
                      aria-label="Protein progress"
                      aria-valuemin={0}
                      aria-valuemax={Math.round(targetProtein)}
                      aria-valuenow={Math.round(consumedProtein)}
                    />
                  </div>
                </div>
                <div className="min-w-0 rounded-xl border bg-background p-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Carbs
                  </p>
                  <p className="mt-1 text-base font-semibold leading-none tabular-nums text-foreground">
                    {Math.round(consumedCarbs)}g
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                    of {Math.round(targetCarbs)}g goal
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${
                          targetCarbs > 0
                            ? Math.min(100, (consumedCarbs / targetCarbs) * 100)
                            : 0
                        }%`,
                      }}
                      role="progressbar"
                      aria-label="Carbohydrate progress"
                      aria-valuemin={0}
                      aria-valuemax={Math.round(targetCarbs)}
                      aria-valuenow={Math.round(consumedCarbs)}
                    />
                  </div>
                </div>
                <div className="min-w-0 rounded-xl border bg-background p-3">
                  <p className="text-[11px] font-medium text-muted-foreground">
                    Fat
                  </p>
                  <p className="mt-1 text-base font-semibold leading-none tabular-nums text-foreground">
                    {Math.round(consumedFat)}g
                  </p>
                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                    of {Math.round(targetFat)}g goal
                  </p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${
                          targetFat > 0
                            ? Math.min(100, (consumedFat / targetFat) * 100)
                            : 0
                        }%`,
                      }}
                      role="progressbar"
                      aria-label="Fat progress"
                      aria-valuemin={0}
                      aria-valuemax={Math.round(targetFat)}
                      aria-valuenow={Math.round(consumedFat)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-3" aria-label="Meals by time of day">
          {MEAL_TYPES.map((type) => {
            const items = mealsByType[type] ?? [];
            const mealCalories = Math.round(
              items.reduce(
                (sum, meal) => sum + safeNumber((meal as any)?.calories),
                0
              )
            );
            return (
              <Card key={type} className="border bg-card shadow-sm">
                <CardHeader className="flex flex-row items-center justify-between gap-3 px-4 pb-3 pt-4 sm:px-6">
                  <div className="min-w-0">
                    <CardTitle className="text-[17px] leading-5">
                      {MEAL_LABELS[type]}
                    </CardTitle>
                    <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                      {mealCalories.toLocaleString()} kcal
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openAddDialog(type)}
                    disabled={processing || demo || nutritionUnavailable}
                    title={
                      nutritionUnavailable
                        ? nutritionOfflineMessage
                        : demo
                          ? "Demo mode: sign in to save"
                          : undefined
                    }
                    className="h-9 shrink-0 px-3 text-[13px]"
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add food
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2 px-4 pb-4 sm:px-6 sm:pb-5">
                  {!items.length && (
                    <p className="rounded-lg border border-dashed px-3 py-4 text-center text-[13px] leading-5 text-muted-foreground">
                      No items yet.
                    </p>
                  )}
                  {items.map((meal, mealIndex) => {
                    const id =
                      meal.id || `${type}-${meal.name || "meal"}-${mealIndex}`;
                    const isHighlighted = highlightMealId === meal.id;
                    const item = meal.item
                      ? normalizedFromSnapshot(meal.item)
                      : null;
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
                        className={`flex items-start justify-between gap-3 rounded-xl border p-3 ${
                          isHighlighted ? "border-primary bg-primary/5" : ""
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate text-[15px] font-semibold leading-5 text-foreground">
                            {meal.name || "Meal"}
                          </div>
                          <div className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
                            {Math.round(safeNumber(meal.calories))} kcal · P{" "}
                            {Math.round(safeNumber(meal.protein))}g · C{" "}
                            {Math.round(safeNumber(meal.carbs))}g · F{" "}
                            {Math.round(safeNumber(meal.fat))}g
                          </div>
                          {(servingText || gramsText) && (
                            <div className="text-xs leading-5 text-muted-foreground">
                              {servingText}
                              {servingText && gramsText ? " · " : ""}
                              {gramsText}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row">
                          {item && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              onClick={() =>
                                openEditor(
                                  item,
                                  meal.serving?.qty ?? 1,
                                  (meal.serving?.unit as ServingUnit) ||
                                    "serving"
                                )
                              }
                              disabled={processing || demo}
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
                            className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                            onClick={() => meal.id && handleDelete(meal.id)}
                            disabled={processing || demo}
                            title={
                              demo ? "Demo mode: sign in to save" : undefined
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </section>

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

        {(customFoods.length > 0 || recipes.length > 0) && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4" /> My foods & recipes
              </CardTitle>
              <Button size="sm" variant="outline" asChild>
                <a href="/meals/my-foods">Manage</a>
              </Button>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {[...recipes, ...customFoods].map((entry) => (
                <Button
                  key={`${entry.item.source}-${entry.id}`}
                  size="sm"
                  variant="secondary"
                  onClick={() => openEditor(entry.item)}
                >
                  {entry.item.name}
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
      </main>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-xl sm:px-6">
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
        <DialogContent className="max-h-[85dvh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-3xl sm:px-6">
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
        <DialogContent className="max-h-[85dvh] overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-lg sm:px-6">
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
