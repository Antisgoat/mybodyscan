import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Search, Barcode, Loader2, Star, StarOff } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FoodSearchRow, foodLabel } from "@/components/nutrition/FoodSearchRow";
import { ServingEditor } from "@/components/nutrition/ServingEditor";
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
import type { FoodItem, ServingOption } from "@/lib/nutrition/types";
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
  buildMealEntry,
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
const INITIAL_RESULT_COUNT = 8;

function currentLocalDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readRecents(): FoodItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .filter(
          (item) =>
            item &&
            typeof item.id === "string" &&
            typeof item.name === "string" &&
            item.serving &&
            item.per_serving
        )
        .slice(0, MAX_RECENTS);
    }
  } catch (error) {
    console.warn("recents_parse_error", error);
  }
  return [];
}

function storeRecents(items: FoodItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(items.slice(0, MAX_RECENTS))
    );
  } catch {
    /* Optional cache must not turn a successful save into an error. */
  }
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
      source: raw.source === "Open Food Facts" ? "Open Food Facts" : "USDA",
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
  error: string | null;
  onClose: () => void;
  onConfirm: (payload: {
    quantity: number;
    unit: ServingUnit;
    result: SelectionResult;
    mealType: MealType;
    notes?: string;
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
  error,
  onClose,
  onConfirm,
}: ServingModalProps) {
  const demo = useDemoMode();
  const [mealType, setMealType] = useState<MealType>("snacks");
  useEffect(() => setMealType("snacks"), [item]);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-2xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-5 text-xl leading-tight">
            {foodLabel(item.name)}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {item.serving.text || "Choose your portion"}
            {item.brand ? " · " + foodLabel(item.brand) : ""}
          </p>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Not saved yet</AlertTitle>
            <AlertDescription>
              {error} Your portion is still here. Try saving again.
            </AlertDescription>
          </Alert>
        )}
        <div className="space-y-2">
          <Label htmlFor="serving-mealType">Add to</Label>
          <select
            id="serving-mealType"
            className="h-11 w-full rounded-xl border bg-background px-3 text-sm"
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
        <ServingEditor
          item={item}
          busy={busy}
          readOnly={demo}
          onCancel={onClose}
          onConfirm={({ qty, unit, result, meal }) =>
            onConfirm({
              quantity: qty,
              unit,
              result,
              mealType,
              notes: meal.notes,
            })
          }
        />
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
  const [visibleResultCount, setVisibleResultCount] =
    useState(INITIAL_RESULT_COUNT);
  const [primarySource, setPrimarySource] = useState<
    "USDA" | "Open Food Facts" | null
  >(null);
  const [recents, setRecents] = useState<FoodItem[]>(() => readRecents());
  const [favorites, setFavorites] = useState<FavoriteDocWithId[]>([]);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [logging, setLogging] = useState(false);
  const loggingRef = useRef(false);
  const selectedMealIdRef = useRef<string>();
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    selectedMealIdRef.current = selectedItem ? crypto.randomUUID() : undefined;
    setSaveError(null);
  }, [selectedItem]);
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
    setVisibleResultCount(INITIAL_RESULT_COUNT);
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
    mealType: MealType,
    notes?: string
  ) => {
    if (loggingRef.current) return;
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
    if (notes) meal.notes = notes;

    loggingRef.current = true;
    setLogging(true);
    setSaveError(null);
    try {
      await addMeal(today, {
        ...meal,
        id: selectedMealIdRef.current,
        mealType,
      });
      toast({ title: "Food logged", description: item.name });
      updateRecents(item);
      setSelectedItem(null);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unable to save. Please try again."
      );
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
      loggingRef.current = false;
      setLogging(false);
    }
  };

  const primaryCaption = "Check the portion and preparation before adding.";

  const favoritesMap = useMemo(
    () => new Map(favorites.map((fav) => [fav.id, fav])),
    [favorites]
  );

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
      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">
            Your food, simply tracked
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            Search Foods
          </h1>
          <p className="text-sm text-muted-foreground">
            Find a food. Check your portion. You’re done.
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
            aria-label="Search foods"
            placeholder="Food, brand, or barcode"
            className="h-12 min-w-0 flex-1 rounded-xl bg-secondary/40 text-base"
            data-testid="nutrition-search"
            disabled={searchDisabled}
            title={searchDisabled ? searchBlockReason : undefined}
          />
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl"
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

        {!query.trim() && favorites.length > 0 && (
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

        {!query.trim() && recents.length > 0 && (
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

        <section
          aria-label="Food search results"
          className="rounded-2xl border bg-card p-4 sm:p-5"
        >
          <div className="mb-2">
            <h2 className="font-semibold">
              {query.trim() ? "Search results" : "Find your next meal"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {primaryCaption}
            </p>
          </div>
          {status && (
            <p
              className="py-2 text-xs text-muted-foreground"
              role="status"
              aria-live="polite"
            >
              {status}
            </p>
          )}
          {loading && (
            <div role="status" className="space-y-3 py-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Searching foods…
              </p>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-20 animate-pulse rounded-xl bg-secondary/60"
                  aria-hidden="true"
                />
              ))}
            </div>
          )}
          {!loading && !query.trim() && (
            <p className="py-5 text-sm text-muted-foreground">
              Search for something simple, like eggs, beef, or cooked rice.
            </p>
          )}
          {!loading && searchWarning && (
            <p className="py-3 text-sm text-muted-foreground">
              {searchWarning}
            </p>
          )}
          {!loading && !!query.trim() && !results.length && !searchWarning && (
            <p className="py-5 text-sm text-muted-foreground">
              No matches. Try a simpler name or scan the barcode.
            </p>
          )}
          {!loading && (
            <ul className="divide-y">
              {results.slice(0, visibleResultCount).map((item) => {
                const favorite = favoritesMap.get(item.id);
                return (
                  <li key={item.id}>
                    <FoodSearchRow
                      item={item}
                      onSelect={() => setSelectedItem(item)}
                      favoriteAction={
                        <DemoWriteButton
                          size="icon"
                          variant="ghost"
                          className="h-10 w-8 shrink-0 text-muted-foreground"
                          onClick={() => toggleFavorite(item)}
                          aria-label={
                            favorite
                              ? `Remove ${item.name} from favorites`
                              : `Save ${item.name} to favorites`
                          }
                          aria-pressed={Boolean(favorite)}
                        >
                          {favorite ? (
                            <Star className="h-4 w-4 fill-amber-400 text-amber-600" />
                          ) : (
                            <StarOff className="h-4 w-4" />
                          )}
                        </DemoWriteButton>
                      }
                    />
                  </li>
                );
              })}
            </ul>
          )}
          {!loading && results.length > visibleResultCount && (
            <Button
              type="button"
              variant="outline"
              className="mt-3 w-full rounded-xl"
              onClick={() =>
                setVisibleResultCount((count) =>
                  Math.min(results.length, count + INITIAL_RESULT_COUNT)
                )
              }
            >
              Show{" "}
              {Math.min(
                INITIAL_RESULT_COUNT,
                results.length - visibleResultCount
              )}{" "}
              more
            </Button>
          )}
        </section>
      </main>

      {selectedItem && (
        <ServingModal
          item={selectedItem}
          open={Boolean(selectedItem)}
          busy={logging}
          error={saveError}
          onClose={() => (!logging ? setSelectedItem(null) : undefined)}
          onConfirm={({ quantity, unit, result, mealType, notes }) =>
            handleLogFood(selectedItem, quantity, unit, result, mealType, notes)
          }
        />
      )}
    </div>
  );
}
