import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, Barcode, Loader2, Star, StarOff } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { searchFoods, type NormalizedItem } from "@/lib/nutritionShim";
import { addMeal } from "@/lib/nutrition";
import {
  saveFavorite,
  removeFavorite,
  subscribeFavorites,
  type FavoriteDocWithId,
} from "@/lib/nutritionCollections";
import { ServingChooser } from "@/components/ServingChooser";
import { calcMacrosFromGrams, fromOFF, fromSearchItem, fromUSDA, type FoodNormalized } from "@/lib/nutrition/measureMap";

const RECENTS_KEY = "mbs_nutrition_recents_v2";
const MAX_RECENTS = 50;

function readRecents(): NormalizedItem[] {
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

function storeRecents(items: NormalizedItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
}

export default function MealsSearch() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<NormalizedItem[]>([]);
  const [recents, setRecents] = useState<NormalizedItem[]>(() => readRecents());
  const [favorites, setFavorites] = useState<FavoriteDocWithId[]>([]);
  const [chooser, setChooser] = useState<{ item: NormalizedItem; food: FoodNormalized } | null>(null);
  const [logging, setLogging] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    try {
      const unsub = subscribeFavorites(setFavorites);
      return () => {
        unsub?.();
      };
    } catch (error) {
      console.warn("favorites_subscribe_error", error);
      setFavorites([]);
      return undefined;
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(() => {
      searchFoods(trimmed)
        .then(setResults)
        .catch((error: any) => {
          console.error(error);
          if (typeof error?.status === "number" && error.status >= 500) {
            toast({
              title: "Nutrition search temporarily unavailable.",
              description: "Please try again later.",
              variant: "destructive",
            });
          } else {
            toast({ title: "Search failed", description: "Try another food", variant: "destructive" });
          }
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const openChooser = (item: NormalizedItem) => {
    try {
      const food = mapToFoodNormalized(item);
      setChooser({ item, food });
    } catch (error) {
      console.error("serving_chooser_error", error);
      toast({ title: "Unable to load servings", description: "Try another food", variant: "destructive" });
    }
  };

  const updateRecents = useCallback(
    (item: NormalizedItem) => {
      const next = [item, ...recents.filter((recent) => recent.id !== item.id)].slice(0, MAX_RECENTS);
      setRecents(next);
      storeRecents(next);
    },
    [recents],
  );

  const handleChooserConfirm = async (selection: { grams: number; label: string; quantity: number }) => {
    if (!chooser || logging) return;
    const current = chooser;
    setChooser(null);
    setLogging(true);
    try {
      const macros = calcMacrosFromGrams(current.food.basePer100g, selection.grams);
      await addMeal(today, {
        name: current.food.name,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        calories: macros.kcal,
        serving: {
          qty: selection.quantity,
          unit: selection.label,
          grams: selection.grams,
        },
        item: {
          id: current.food.id,
          name: current.food.name,
          brand: current.food.brand ?? null,
          source: current.food.source,
          serving: {
            qty: selection.quantity,
            unit: selection.label,
            text: `${selection.quantity} ${selection.label}`,
          },
          per_serving: {
            kcal: macros.kcal,
            protein_g: macros.protein,
            carbs_g: macros.carbs,
            fat_g: macros.fat,
          },
          per_100g: {
            kcal: current.food.basePer100g.kcal,
            protein_g: current.food.basePer100g.protein,
            carbs_g: current.food.basePer100g.carbs,
            fat_g: current.food.basePer100g.fat,
          },
          fdcId: current.item.fdcId ?? null,
          gtin: current.item.gtin,
        },
        entrySource: "search",
      });
      toast({ title: "Food logged", description: current.food.name });
      updateRecents(current.item);
    } catch (error: any) {
      toast({ title: "Unable to log", description: error?.message || "Try again", variant: "destructive" });
    } finally {
      setLogging(false);
    }
  };

  const toggleFavorite = async (item: NormalizedItem) => {
    try {
      const existing = favorites.find((fav) => fav.id === item.id);
      if (existing) {
        await removeFavorite(existing.id);
        toast({ title: "Removed from favorites", description: item.name });
      } else {
        await saveFavorite(item);
        toast({ title: "Favorited", description: item.name });
      }
    } catch (error: any) {
      toast({ title: "Favorite update failed", description: error?.message || "Try again", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo title="Food Search" description="Find foods from USDA and OpenFoodFacts" />
      <AppHeader />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div className="space-y-2 text-center">
          <Search className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">Search Foods</h1>
          <p className="text-sm text-muted-foreground">Tap a result to adjust servings. Results use kcal and US units.</p>
        </div>

        <form className="flex gap-2" onSubmit={(event) => event.preventDefault()}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chicken breast, oatmeal, whey…"
            className="flex-1"
          />
          <Button type="button" variant="outline" asChild>
            <a href="/barcode">
              <Barcode className="mr-1 h-4 w-4" />
              Scan
            </a>
          </Button>
        </form>

        {favorites.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-yellow-500" /> Favorites
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {favorites.map((fav) => (
                <Button key={fav.id} variant="secondary" size="sm" onClick={() => openChooser(fav.item)}>
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
                <HistoryIcon /> Recent
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {recents.slice(0, 8).map((item) => (
                <Button key={item.id} variant="outline" size="sm" onClick={() => openChooser(item)}>
                  {item.name}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Results</CardTitle>
            <div className="text-xs text-muted-foreground">USDA primary · OFF fallback</div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching databases…
              </div>
            )}
            {!loading && !results.length && query.trim().length > 0 && (
              <p className="text-sm text-muted-foreground">No matches. Try another term or scan the barcode.</p>
            )}
            {!loading && !query.trim() && <p className="text-sm text-muted-foreground">Enter a food name to begin.</p>}
            {results.map((item) => {
              const favorite = favorites.find((fav) => fav.id === item.id);
              const subtitle = item.brand || (item.source === "OFF" ? "Open Food Facts" : "USDA");
              return (
                <Card key={item.id} className="border">
                  <CardContent className="flex flex-col gap-2 py-4 text-sm md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{subtitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.per_serving.kcal ?? "—"} kcal • {item.per_serving.protein_g ?? "—"}g P • {item.per_serving.carbs_g ?? "—"}g C •
                        {item.per_serving.fat_g ?? "—"}g F
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="ghost" onClick={() => toggleFavorite(item)}>
                        {favorite ? (
                          <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                        ) : (
                          <StarOff className="h-4 w-4" />
                        )}
                      </Button>
                      <Button size="sm" onClick={() => openChooser(item)} disabled={logging}>
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

      {chooser && (
        <ServingChooser
          food={chooser.food}
          onClose={() => setChooser(null)}
          onConfirm={handleChooserConfirm}
        />
      )}
    </div>
  );
}

function HistoryIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 12a9 9 0 1 1 3.89 7.39" />
      <polyline points="3 12 6 9 9 12" />
      <line x1="12" y1="7" x2="12" y2="12" />
      <line x1="12" y1="12" x2="15" y2="15" />
    </svg>
  );
}

function mapToFoodNormalized(item: NormalizedItem): FoodNormalized {
  const hasServings = Array.isArray(item.servings) && item.servings.length > 0;
  const baseFromItem = item.basePer100g
    ? {
        kcal: numberOrZero(item.basePer100g.kcal),
        protein: numberOrZero(item.basePer100g.protein, 1),
        carbs: numberOrZero(item.basePer100g.carbs, 1),
        fat: numberOrZero(item.basePer100g.fat, 1),
      }
    : item.per_100g
    ? {
        kcal: numberOrZero(item.per_100g.kcal),
        protein: numberOrZero(item.per_100g.protein_g, 1),
        carbs: numberOrZero(item.per_100g.carbs_g, 1),
        fat: numberOrZero(item.per_100g.fat_g, 1),
      }
    : null;

  if (hasServings && baseFromItem) {
    return fromSearchItem({
      id: item.id,
      name: item.name,
      brand: item.brand ?? null,
      source: item.source,
      basePer100g: baseFromItem,
      servings: item.servings ?? [],
    });
  }

  if (item.source === "USDA" && item.raw) {
    try {
      return fromUSDA(item.raw);
    } catch (error) {
      console.warn("usda_map_error", error);
    }
  }
  if (item.source === "OFF" && item.raw) {
    try {
      return fromOFF(item.raw);
    } catch (error) {
      console.warn("off_map_error", error);
    }
  }
  return fallbackFoodNormalized(item);
}

function fallbackFoodNormalized(item: NormalizedItem): FoodNormalized {
  const base: FoodNormalized["basePer100g"] = item.basePer100g
    ? {
        kcal: numberOrZero(item.basePer100g.kcal),
        protein: numberOrZero(item.basePer100g.protein, 1),
        carbs: numberOrZero(item.basePer100g.carbs, 1),
        fat: numberOrZero(item.basePer100g.fat, 1),
      }
    : {
        kcal: numberOrZero(item.per_100g?.kcal),
        protein: numberOrZero(item.per_100g?.protein_g, 1),
        carbs: numberOrZero(item.per_100g?.carbs_g, 1),
        fat: numberOrZero(item.per_100g?.fat_g, 1),
      };

  const servingGrams = parseServingGrams(item);
  if (servingGrams && !baseHasValues(base)) {
    const factor = 100 / servingGrams;
    base.kcal = numberOrZero((item.per_serving.kcal ?? 0) * factor, 0);
    base.protein = numberOrZero((item.per_serving.protein_g ?? 0) * factor, 1);
    base.carbs = numberOrZero((item.per_serving.carbs_g ?? 0) * factor, 1);
    base.fat = numberOrZero((item.per_serving.fat_g ?? 0) * factor, 1);
  }

  const servings: FoodNormalized["servings"] = [
    { id: "100g", label: "100 g", grams: 100, isDefault: true },
  ];

  if (servingGrams) {
    const label =
      (typeof item.serving.text === "string" && item.serving.text.trim()) ||
      buildServingLabel(item.serving.qty, item.serving.unit) ||
      `${servingGrams} g`;
    if (!servings.some((option) => option.label === label)) {
      servings.push({ id: `${item.id}-serving`, label, grams: Number(servingGrams.toFixed(2)) });
    }
  }

  return {
    id: item.id,
    name: item.name,
    brand: item.brand,
    source: item.source,
    basePer100g: base,
    servings,
  };
}

function numberOrZero(value: unknown, decimals = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** decimals;
  return Math.round(num * factor) / factor;
}

function baseHasValues(base: FoodNormalized["basePer100g"]): boolean {
  return Boolean(base.kcal || base.protein || base.carbs || base.fat);
}

function parseServingGrams(item: NormalizedItem): number | null {
  const qty = typeof item.serving.qty === "number" ? item.serving.qty : null;
  const unit = typeof item.serving.unit === "string" ? item.serving.unit : null;
  const gramsFromUnit = convertToGrams(qty, unit);
  if (gramsFromUnit) return gramsFromUnit;
  if (typeof item.serving.text === "string") {
    const match = item.serving.text.match(/([\d.,]+)\s*(g|oz|ml|kg|lb)/i);
    if (match) {
      return convertToGrams(Number(match[1].replace(/,/g, "")), match[2]);
    }
  }
  return null;
}

function convertToGrams(quantity: number | null, unit: string | null): number | null {
  if (!quantity || quantity <= 0 || !unit) return null;
  const normalized = unit.trim().toLowerCase();
  switch (normalized) {
    case "g":
    case "gram":
    case "grams":
      return quantity;
    case "kg":
    case "kilogram":
    case "kilograms":
      return quantity * 1000;
    case "oz":
    case "ounce":
    case "ounces":
      return quantity * 28.3495231;
    case "lb":
    case "lbs":
    case "pound":
    case "pounds":
      return quantity * 453.59237;
    case "ml":
    case "milliliter":
    case "milliliters":
      return quantity;
    case "l":
    case "liter":
    case "liters":
      return quantity * 1000;
    default:
      return null;
  }
}

function buildServingLabel(qty: number | null | undefined, unit: string | null | undefined): string | null {
  if (!qty || !unit) return null;
  const roundedQty = Math.round(qty * 100) / 100;
  return `${roundedQty} ${unit}`;
}
