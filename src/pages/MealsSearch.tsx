import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { Search, Plus, Barcode, Loader2, Star, StarOff } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import type { FoodItem } from "@/lib/nutrition/types";
import {
  saveFavorite,
  removeFavorite,
  subscribeFavorites,
  type FavoriteDocWithId,
} from "@/lib/nutritionCollections";
import { useDemoMode } from "@/components/DemoModeProvider";
import { addMeal } from "@/lib/nutritionBackend";
import { useAuthUser } from "@/auth/mbs-auth";
import {
  availableServingUnits,
  buildMealEntry,
  calculateSelection,
  gramsToOunces,
  roundGrams,
  roundKcal,
  type SelectionResult,
  type ServingUnit,
} from "@/lib/nutritionMath";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { buildErrorToast } from "@/lib/errorToasts";
import { sanitizeNutritionQuery } from "@/lib/nutrition/sanitizeQuery";
import { backend } from "@/lib/backendBridge";
import { nutritionSearchClient } from "@/lib/nutritionApi";
import { BarcodeScanner } from "@/components/BarcodeScanner";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { reportError } from "@/lib/telemetry";

const RECENTS_KEY = "mbs_nutrition_recents_v3";
const MAX_RECENTS = 50;

function currentLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readRecents(): FoodItem[] {
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

function storeRecents(items: FoodItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    RECENTS_KEY,
    JSON.stringify(items.slice(0, MAX_RECENTS))
  );
}

function adaptSearchItem(raw: any): FoodItem {
  if (
    raw &&
    typeof raw === "object" &&
    typeof raw.id === "string" &&
    typeof raw.name === "string" &&
    raw.basePer100g &&
    Array.isArray(raw.servings) &&
    raw.serving &&
    raw.per_serving
  ) {
    return {
      ...raw,
      id: raw.id.trim(),
      name: raw.name.trim() || "Food",
      brand:
        typeof raw.brand === "string" && raw.brand.trim()
          ? raw.brand.trim()
          : null,
      source:
        raw.source === "Open Food Facts" ? "Open Food Facts" : "USDA",
    } as FoodItem;
  }
  const calories =
    Number(raw?.calories ?? raw?.kcal ?? raw?.energyKcal ?? 0) || 0;
  const protein = Number(raw?.protein ?? raw?.protein_g ?? 0) || 0;
  const carbs = Number(raw?.carbs ?? raw?.carbs_g ?? 0) || 0;
  const fat = Number(raw?.fat ?? raw?.fat_g ?? 0) || 0;
  const sourceRaw = typeof raw?.source === "string" ? raw.source : undefined;
  const source = sourceRaw
    ? sourceRaw
    : raw?.provider === "OFF"
      ? "Open Food Facts"
      : "USDA";

  const basePer100g = {
    kcal: calories,
    protein,
    carbs,
    fat,
  };

  const perServing = {
    kcal: calories || null,
    protein_g: protein || null,
    carbs_g: carbs || null,
    fat_g: fat || null,
  };

  const servings: ServingOption[] = [
    {
      id: "100g",
      label: "100 g",
      grams: 100,
      isDefault: true,
    },
  ];

  if (typeof raw?.serving === "string" && raw.serving.trim().length) {
    servings.push({
      id: "serving",
      label: raw.serving.trim(),
      grams: Number(raw.servingGrams ?? 0) || 0,
      isDefault: false,
    });
  }

  const fallbackId =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `food-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id: raw?.id ?? fallbackId,
    name: raw?.name ?? "Unknown food",
    brand: raw?.brand ?? raw?.brandOwner ?? raw?.brands ?? null,
    source,
    basePer100g,
    servings,
    serving: { qty: 1, unit: "serving", text: "1 serving" },
    per_serving: perServing,
    per_100g: perServing,
    raw,
  };
}

interface ServingModalProps {
  item: FoodItem;
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: {
    quantity: number;
    unit: ServingUnit;
    result: SelectionResult;
    mealType: MealType;
  }) => void;
}

type MealType = "breakfast" | "lunch" | "dinner" | "snacks";
const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snacks"];
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snacks: "Snacks",
};

function ServingModal({
  item,
  open,
  busy,
  onClose,
  onConfirm,
}: ServingModalProps) {
  const [quantity, setQuantity] = useState<number>(1);
  const units = useMemo(() => availableServingUnits(item), [item]);
  const [unit, setUnit] = useState<ServingUnit>(
    units.includes("serving") ? "serving" : units[0] ?? "g"
  );
  const [mealType, setMealType] = useState<MealType>("snacks");

  useEffect(() => {
    setQuantity(1);
    const nextUnits = availableServingUnits(item);
    setUnit(nextUnits.includes("serving") ? "serving" : nextUnits[0] ?? "g");
    setMealType("snacks");
  }, [item]);

  const result = useMemo(
    () => calculateSelection(item, quantity, unit),
    [item, quantity, unit]
  );
  const disableAdd =
    !quantity ||
    quantity <= 0 ||
    (result.calories == null &&
      result.protein == null &&
      result.carbs == null &&
      result.fat == null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-1">
            <span>{item.name}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {item.brand || item.source}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="serving-quantity">Amount</Label>
              <Input
                id="serving-quantity"
                type="number"
                min="0"
                step="0.1"
                value={quantity}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setQuantity(Number.isFinite(value) ? Math.max(0, value) : 0);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serving-unit">Unit</Label>
              <select
                id="serving-unit"
                className="min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={unit}
                onChange={(event) =>
                  setUnit(event.target.value as ServingUnit)
                }
                disabled={busy}
              >
                {units.map((option) => (
                  <option key={option} value={option}>
                    {option === "serving" && item.serving.text
                      ? `serving (${item.serving.text})`
                      : option}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="serving-mealType">Log to</Label>
            <select
              id="serving-mealType"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={mealType}
              onChange={(event) => setMealType(event.target.value as MealType)}
              disabled={busy}
            >
              {MEAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {MEAL_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md bg-muted/60 p-4 text-sm">
            <div className="font-medium text-foreground">Total</div>
            <div className="mt-1 text-muted-foreground">
              {result.grams
                ? `${roundGrams(result.grams)} g · ${gramsToOunces(result.grams) ?? "—"} oz`
                : `${quantity} ${unit}`}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span>
                {result.calories == null
                  ? "—"
                  : roundKcal(result.calories)}{" "}
                kcal
              </span>
              <span>
                {result.protein == null ? "—" : roundGrams(result.protein)}g P
              </span>
              <span>
                {result.carbs == null ? "—" : roundGrams(result.carbs)}g C
              </span>
              <span>
                {result.fat == null ? "—" : roundGrams(result.fat)}g F
              </span>
            </div>
            {unit === "ml" ? (
              <p className="mt-2 text-xs text-muted-foreground">
                mL calculations use the product’s labeled volume serving; no
                density is guessed.
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </Button>
            <DemoWriteButton
              type="button"
              onClick={() => onConfirm({ quantity, unit, result, mealType })}
              disabled={busy || disableAdd}
            >
              {busy ? "Adding…" : "Add"}
            </DemoWriteButton>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MealsSearch() {
  const demo = useDemoMode();
  const { user, authReady } = useAuthUser();
  const appCheckReady = true;
  const uid = authReady ? (user?.uid ?? null) : null;
  const location = useLocation();
  const signUpHref = `/auth?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
  const readOnlyDemo = demo && !user;
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FoodItem[]>([]);
  const [primarySource, setPrimarySource] = useState<
    "USDA" | "Open Food Facts" | null
  >(null);
  const [recents, setRecents] = useState<FoodItem[]>(() => readRecents());
  const [favorites, setFavorites] = useState<FavoriteDocWithId[]>([]);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [logging, setLogging] = useState(false);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 350);
  const { health: systemHealth } = useSystemHealth();
  const { nutritionConfigured } = computeFeatureStatuses(
    systemHealth ?? undefined
  );
  const nutritionEnabled = nutritionConfigured !== false;
  const offlineReason =
    "Backend unavailable (Cloud Functions). Check deployment / network.";
  const demoReason =
    "Nutrition search is disabled in demo mode. Sign in to use it.";
  const searchBlockReason = demo ? demoReason : offlineReason;
  const searchDisabled = demo || !nutritionEnabled;

  useEffect(() => {
    if (!authReady || !uid) {
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
  }, [authReady, uid]);

  useEffect(() => {
    if (demo) {
      setLoading(false);
      setResults([]);
      setPrimarySource(null);
      setStatus(demoReason);
      setSearchWarning(demoReason);
      return;
    }

    if (!nutritionEnabled) {
      setLoading(false);
      setResults([]);
      setPrimarySource(null);
      setStatus(offlineReason);
      setSearchWarning(offlineReason);
      return;
    }

    const term = sanitizeNutritionQuery(debouncedQuery);
    if (!term) {
      setResults([]);
      setPrimarySource(null);
      setLoading(false);
      setSearchWarning(null);
      setStatus("");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setSearchWarning(null);
    setStatus("Searching…");

    (async () => {
      try {
        const response = await nutritionSearchClient(term, {
          sourcePreference: "combined",
        });
        if (cancelled) return;
        if (!response || response.status === "upstream_error") {
          const message =
            response?.message ?? "Food database temporarily busy; try again.";
          setResults([]);
          setPrimarySource(null);
          setStatus(message);
          setSearchWarning(message);
          return;
        }
        const mapped = (response.results ?? []).map(adaptSearchItem);
        setResults(mapped);
        setPrimarySource(
          mapped.length
            ? (mapped[0]!.source as "USDA" | "Open Food Facts" | null)
            : null
        );
        setStatus(
          mapped.length
            ? `Found ${mapped.length} item${mapped.length === 1 ? "" : "s"}`
            : "No matches found."
        );
        setSearchWarning(
          mapped.length ? null : "No foods matched. Try a different term."
        );
      } catch (error: any) {
        if (cancelled) return;
        console.error("nutritionSearch error", error);
        setResults([]);
        setPrimarySource(null);
        const errMessage =
          typeof error?.message === "string" && error.message.length
            ? error.message
            : String(error);
        const cleaned = errMessage === "Bad Request" ? "" : errMessage;
        const message = cleaned || "Food database temporarily busy; try again.";
        setStatus(message);
        setSearchWarning(message);
        void reportError({
          kind: "client_error",
          message: cleaned || "nutritionSearch failed",
          code: error?.code || "client_error",
          extra: { fn: "nutritionSearch" },
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, demo, nutritionEnabled, toast]);

  const updateRecents = (item: FoodItem) => {
    const next = [
      item,
      ...recents.filter((recent) => recent.id !== item.id),
    ].slice(0, MAX_RECENTS);
    setRecents(next);
    storeRecents(next);
  };

  const handleBarcodeSuccess = async (code: string) => {
    setScannerOpen(false);
    if (searchDisabled) {
      setStatus(searchBlockReason);
      setSearchWarning(searchBlockReason);
      return;
    }
    const normalized = sanitizeNutritionQuery(code);
    if (!normalized) {
      setStatus("Invalid barcode");
      setSearchWarning("Invalid barcode");
      return;
    }
    setLoading(true);
    setStatus(`Looking up barcode ${normalized}…`);
    setSearchWarning(null);
    try {
      const { item, items } = await backend.nutritionBarcode({
        upc: normalized,
      });
      const list = items ?? (item ? [item] : []);
      const adaptedList = list
        .map(adaptSearchItem)
        .filter(Boolean) as FoodItem[];
      if (adaptedList.length) {
        setResults(adaptedList);
        setPrimarySource(
          adaptedList[0]?.source === "Open Food Facts"
            ? "Open Food Facts"
            : "USDA"
        );
        setStatus(
          adaptedList.length > 1
            ? `Found ${adaptedList.length} matches`
            : "Barcode match found"
        );
        setSearchWarning(null);
      } else {
        setResults([]);
        setPrimarySource(null);
        setStatus("Product not found");
        setSearchWarning("Product not found");
      }
    } catch (error: any) {
      console.error("nutritionBarcode error", error);
      const errMessage =
        typeof error?.message === "string" && error.message.length
          ? error.message
          : String(error);
      const cleaned = errMessage === "Bad Request" ? "" : errMessage;
      const message = cleaned || "Scan failed. Try again.";
      setResults([]);
      setPrimarySource(null);
      setStatus(message);
      setSearchWarning(message);
      void reportError({
        kind: "client_error",
        message: cleaned || "nutritionBarcode failed",
        code: error?.code || "client_error",
        extra: { fn: "nutritionBarcode" },
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeError = (message: string) => {
    setScannerOpen(false);
    if (searchDisabled) {
      setStatus(searchBlockReason);
      setSearchWarning(searchBlockReason);
      return;
    }
    setStatus(message);
    setSearchWarning(message);
  };

  const toggleFavorite = async (item: FoodItem) => {
    if (!authReady || !appCheckReady || !uid) {
      toast({
        title: "Initializing",
        description:
          "Secure favorites are almost ready. Try again in a moment.",
      });
      return;
    }
    try {
      const existing = favorites.find((fav) => fav.id === item.id);
      if (existing) {
        await removeFavorite(existing.id, uid ?? undefined);
        toast({ title: "Removed from favorites", description: item.name });
      } else {
        await saveFavorite(item, uid ?? undefined);
        toast({ title: "Added to favorites", description: item.name });
      }
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: {
            title: "Favorite update failed",
            description: "Try again",
            variant: "destructive",
          },
        })
      );
    }
  };

  const handleLogFood = async (
    item: FoodItem,
    quantity: number,
    unit: ServingUnit,
    result: SelectionResult,
    mealType: MealType
  ) => {
    if (demo) {
      toast({ title: "Demo mode: sign in to save" });
      return;
    }

    if (!authReady || !user) {
      toast({
        title: "Sign in required",
        description: "Sign in to log meals.",
        variant: "destructive",
      });
      return;
    }

    const today = currentLocalDate();
    const meal = buildMealEntry(item, quantity, unit, result, "search");

    setLogging(true);
    try {
      await addMeal(today, {
        ...meal,
        mealType,
      });
      toast({ title: "Food logged", description: item.name });
      updateRecents(item);
      setSelectedItem(null);
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: {
            title: "Unable to log",
            description: "Try again",
            variant: "destructive",
          },
        })
      );
    } finally {
      setLogging(false);
    }
  };

  const primaryCaption = primarySource
    ? `USDA + Open Food Facts · first match: ${primarySource}`
    : "USDA + Open Food Facts";

  const favoritesMap = useMemo(
    () => new Map(favorites.map((fav) => [fav.id, fav])),
    [favorites]
  );
  const searchNotice = null;

  return (
    <div
      className="min-h-screen bg-background pb-20 md:pb-0"
      data-testid="route-meals"
    >
      <Seo
        title="Food Search"
        description="Find foods from USDA and OpenFoodFacts"
      />
      {readOnlyDemo && (
        <div className="px-6">
          <Alert variant="default" className="border-primary/40 bg-primary/5">
            <AlertTitle>Demo preview</AlertTitle>
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Sign up to log meals, save favorites, and sync nutrition to your
                account.
              </span>
              <Button asChild size="sm" variant="outline">
                <a href={signUpHref}>Sign up to use this feature</a>
              </Button>
            </AlertDescription>
          </Alert>
        </div>
      )}
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div className="space-y-2 text-center">
          <Search className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">
            Search Foods
          </h1>
          <p className="text-sm text-muted-foreground">
            Tap a result to adjust servings and log it to your meals.
          </p>
        </div>

        {!nutritionEnabled && !demo && (
          <Alert variant="destructive">
            <AlertTitle>Nutrition search unavailable</AlertTitle>
            <AlertDescription>{offlineReason}</AlertDescription>
          </Alert>
        )}

        <form
          className="flex gap-2"
          onSubmit={(event) => event.preventDefault()}
        >
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chicken breast, oatmeal, whey…"
            className="flex-1"
            data-testid="nutrition-search"
            disabled={searchDisabled}
            title={searchDisabled ? searchBlockReason : undefined}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setScannerOpen(true)}
            disabled={searchDisabled || loading}
            title={searchDisabled ? searchBlockReason : undefined}
          >
            <Barcode className="mr-1 h-4 w-4" />
            Scan
          </Button>
        </form>
        {demo && (
          <p className="text-xs text-muted-foreground">
            Search is disabled in demo. Sign in to use.
          </p>
        )}

        <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Scan a barcode</DialogTitle>
            </DialogHeader>
            <BarcodeScanner
              onResult={handleBarcodeSuccess}
              onError={handleBarcodeError}
            />
          </DialogContent>
        </Dialog>

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
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedItem(fav.item)}
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
                Recent
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {recents.slice(0, 8).map((item) => (
                <Button
                  key={item.id}
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedItem(item)}
                >
                  {item.name}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Results</CardTitle>
            <div className="text-xs text-muted-foreground">
              {primaryCaption}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {status && (
              <p
                className="text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                {status}
              </p>
            )}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching
                databases…
              </div>
            )}
            {loading && searchNotice && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {searchNotice}
              </p>
            )}

            {loading &&
              !searchNotice &&
              results?.length === 0 &&
              query.trim().length > 0 && (
                <p className="text-sm text-muted-foreground">
                  No matches. Try ‘chicken breast’, ‘rice’, or scan a barcode.
                </p>
              )}
            {!loading && !query.trim() && (
              <p className="text-sm text-muted-foreground">
                Enter a food name to begin.
              </p>
            )}
            {!loading && searchWarning && (
              <p className="text-sm text-muted-foreground">{searchWarning}</p>
            )}
            {results.map((item) => {
              const favorite = favoritesMap.get(item.id);
              const subtitle = item.brand || item.source;
              const base = item.basePer100g;
              return (
                <Card key={item.id} className="border">
                  <CardContent className="flex flex-col gap-3 py-4 text-sm md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {subtitle}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {roundKcal(base.kcal)} kcal · {roundGrams(base.protein)}
                        g P · {roundGrams(base.carbs)}g C ·{" "}
                        {roundGrams(base.fat)}g F &nbsp;
                        <span className="text-[10px] text-muted-foreground">
                          per 100 g
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DemoWriteButton
                        size="sm"
                        variant="ghost"
                        onClick={() => toggleFavorite(item)}
                        aria-label={
                          favorite
                            ? `Remove ${item.name} from favorites`
                            : `Add ${item.name} to favorites`
                        }
                        aria-pressed={Boolean(favorite)}
                      >
                        {favorite ? (
                          <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        ) : (
                          <StarOff className="h-4 w-4" />
                        )}
                      </DemoWriteButton>
                      <Button size="sm" onClick={() => setSelectedItem(item)}>
                        <Plus className="mr-1 h-4 w-4" /> Add
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

      {selectedItem && (
        <ServingModal
          item={selectedItem}
          open={Boolean(selectedItem)}
          busy={logging}
          onClose={() => (!logging ? setSelectedItem(null) : undefined)}
          onConfirm={({ quantity, unit, result, mealType }) =>
            handleLogFood(selectedItem, quantity, unit, result, mealType)
          }
        />
      )}
    </div>
  );
}
