import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Barcode, Loader2, Star, StarOff } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { searchFoods, type FoodItem as SearchFoodItem } from "@/lib/nutrition";
import type { FoodItem, ServingOption } from "@/lib/nutrition/types";
import {
  saveFavorite,
  removeFavorite,
  subscribeFavorites,
  type FavoriteDocWithId,
} from "@/lib/nutritionCollections";
import { useDemoMode } from "@/components/DemoModeProvider";
import { db } from "@/lib/firebase";
import { addDoc } from "@/lib/dbWrite";
import { collection, serverTimestamp } from "firebase/firestore";
import { useAuthUser } from "@/lib/auth";
import { useAppCheckReady } from "@/components/AppCheckProvider";
import { roundGrams, roundKcal, sumNumbers } from "@/lib/nutritionMath";

const RECENTS_KEY = "mbs_nutrition_recents_v3";
const MAX_RECENTS = 50;
const OUNCES_IN_GRAM = 0.0352739619;

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
  window.localStorage.setItem(RECENTS_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)));
}

function roundTo(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function calculateMacros(base: FoodItem["basePer100g"], grams: number) {
  const safeGrams = Number.isFinite(grams) ? Math.max(0, grams) : 0;
  if (!safeGrams) {
    return { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 };
  }
  const factor = safeGrams / 100;
  return {
    grams: safeGrams,
    kcal: sumNumbers([base?.kcal]) * factor,
    protein: sumNumbers([base?.protein]) * factor,
    carbs: sumNumbers([base?.carbs]) * factor,
    fat: sumNumbers([base?.fat]) * factor,
  };
}

function ouncesDisplay(grams: number) {
  if (!grams || grams <= 0) return null;
  return roundTo(grams * OUNCES_IN_GRAM, 2);
}

function findCupServing(servings: ServingOption[]): ServingOption | undefined {
  return servings.find((option) => option.label.toLowerCase().includes("cup"));
}

function adaptSearchItem(raw: SearchFoodItem): FoodItem {
  const basePer100g = {
    kcal: raw.calories ?? 0,
    protein: raw.protein ?? 0,
    carbs: raw.carbs ?? 0,
    fat: raw.fat ?? 0,
  };
  const perServing = {
    kcal: raw.calories ?? null,
    protein_g: raw.protein ?? null,
    carbs_g: raw.carbs ?? null,
    fat_g: raw.fat ?? null,
  };
  return {
    id: raw.id,
    name: raw.name,
    brand: raw.brand ?? null,
    source: raw.source === "usda" ? "USDA" : "Open Food Facts",
    basePer100g,
    servings: [
      {
        id: "100g",
        label: "100 g",
        grams: 100,
        isDefault: true,
      },
    ],
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
  onConfirm: (payload: { grams: number; quantity: number }) => void;
}

function ServingModal({ item, open, busy, onClose, onConfirm }: ServingModalProps) {
  const defaultServing = useMemo(() => {
    if (!item.servings?.length) return null;
    return item.servings.find((serving) => serving.isDefault) ?? item.servings[0]!;
  }, [item.servings]);

  const [grams, setGrams] = useState<number>(defaultServing?.grams ?? 100);
  const [quantity, setQuantity] = useState<number>(1);

  useEffect(() => {
    const initial = item.servings?.find((option) => option.isDefault) ?? item.servings?.[0];
    setGrams(initial?.grams ?? 100);
    setQuantity(1);
  }, [item]);

  const totalGrams = Math.max(0, grams * quantity);
  const macros = calculateMacros(item.basePer100g, totalGrams);
  const ounces = ouncesDisplay(totalGrams);
  const cupServing = useMemo(() => findCupServing(item.servings ?? []), [item.servings]);

  const presets: { label: string; grams: number }[] = [
    { label: "100 g", grams: 100 },
    { label: "1 oz", grams: 28.35 },
  ];
  if (cupServing) {
    presets.push({ label: "1 cup", grams: cupServing.grams });
  }

  const disableAdd = !grams || grams <= 0 || !quantity || quantity <= 0;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
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
              <Label htmlFor="serving-grams">Grams per quantity</Label>
              <Input
                id="serving-grams"
                type="number"
                min="0"
                step="0.1"
                value={grams}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setGrams(Number.isFinite(value) ? Math.max(0, value) : 0);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serving-quantity">Quantity</Label>
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
          </div>

          <div className="flex flex-wrap gap-2">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setGrams(preset.grams)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="rounded-md bg-muted/60 p-4 text-sm">
            <div className="font-medium text-foreground">Total</div>
            <div className="mt-1 text-muted-foreground">
              {macros.grams ? `${roundGrams(macros.grams)} g` : "0 g"}
              {ounces ? ` · ${ounces} oz` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span>{roundKcal(macros.kcal)} kcal</span>
              <span>{roundGrams(macros.protein)}g P</span>
              <span>{roundGrams(macros.carbs)}g C</span>
              <span>{roundGrams(macros.fat)}g F</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <DemoWriteButton
              type="button"
              onClick={() => onConfirm({ grams: grams, quantity })}
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
  const appCheckReady = useAppCheckReady();
  const uid = authReady ? user?.uid ?? null : null;
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FoodItem[]>([]);
  const [primarySource, setPrimarySource] = useState<"USDA" | "Open Food Facts" | null>(null);
  const [recents, setRecents] = useState<FoodItem[]>(() => readRecents());
  const [favorites, setFavorites] = useState<FavoriteDocWithId[]>([]);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [logging, setLogging] = useState(false);
  const [searchWarning, setSearchWarning] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    if (!authReady || !appCheckReady || !uid) {
      setFavorites([]);
      return;
    }
    try {
      const unsub = subscribeFavorites(setFavorites);
      return () => unsub?.();
    } catch (error) {
      console.warn("favorites_subscribe_error", error);
      setFavorites([]);
      return undefined;
    }
  }, [authReady, appCheckReady, uid]);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setPrimarySource(null);
      setLoading(false);
      setSearchWarning(null);
      setStatus("");
      return;
    }

    setLoading(true);
    setSearchWarning(null);
    setStatus("Searching…");
    let cancelled = false;
    const handle = window.setTimeout(() => {
      searchFoods(trimmed)
        .then((result) => {
          if (cancelled) return;
          setStatus(result.status);
          const items = result.items.map(adaptSearchItem);
          setResults(items);
          setPrimarySource(items.length ? items[0]!.source : null);
          setSearchWarning(null);
        })
        .catch((error) => {
          if (cancelled) return;
          console.error("nutrition_search_error", error);
          toast({ title: "Search failed", description: "Try another food", variant: "destructive" });
          setResults([]);
          setPrimarySource(null);
          setStatus("Search failed. Try again.");
          setSearchWarning("Food database temporarily busy; try again.");
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, toast]);

  const updateRecents = (item: FoodItem) => {
    const next = [item, ...recents.filter((recent) => recent.id !== item.id)].slice(0, MAX_RECENTS);
    setRecents(next);
    storeRecents(next);
  };

  const toggleFavorite = async (item: FoodItem) => {
    if (!authReady || !appCheckReady || !uid) {
      toast({ title: "Initializing", description: "Secure favorites are almost ready. Try again in a moment." });
      return;
    }
    try {
      const existing = favorites.find((fav) => fav.id === item.id);
      if (existing) {
        await removeFavorite(existing.id);
        toast({ title: "Removed from favorites", description: item.name });
      } else {
        await saveFavorite(item);
        toast({ title: "Added to favorites", description: item.name });
      }
    } catch (error: any) {
      toast({ title: "Favorite update failed", description: error?.message || "Try again", variant: "destructive" });
    }
  };

  const handleLogFood = async (item: FoodItem, grams: number, quantity: number) => {
    if (demo) {
      toast({ title: "Demo mode: sign in to save" });
      return;
    }

    if (!authReady || !appCheckReady || !user) {
      toast({ title: "Sign in required", description: "Sign in to log meals.", variant: "destructive" });
      return;
    }

    const totalGrams = grams * quantity;
    const macros = calculateMacros(item.basePer100g, totalGrams);
    const today = new Date().toISOString().slice(0, 10);

    setLogging(true);
    try {
      const entriesRef = collection(db, `users/${user.uid}/nutritionLogs/${today}/entries`);
      await addDoc(entriesRef, {
        foodId: item.id,
        name: item.name,
        brand: item.brand ?? null,
        grams: roundGrams(totalGrams),
        kcal: roundKcal(macros.kcal),
        protein: roundGrams(macros.protein),
        carbs: roundGrams(macros.carbs),
        fat: roundGrams(macros.fat),
        source: item.source,
        createdAt: serverTimestamp(),
      });
      toast({ title: "Food logged", description: item.name });
      updateRecents(item);
      setSelectedItem(null);
    } catch (error: any) {
      toast({ title: "Unable to log", description: error?.message || "Try again", variant: "destructive" });
    } finally {
      setLogging(false);
    }
  };

  const primaryCaption =
    primarySource === "Open Food Facts"
      ? "OFF primary · USDA fallback"
      : primarySource === "USDA"
        ? "USDA primary · OFF fallback"
        : "USDA + OFF search";

  const favoritesMap = useMemo(() => new Map(favorites.map((fav) => [fav.id, fav])), [favorites]);
  const searchNotice = null;

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0" data-testid="route-meals">
      <Seo title="Food Search" description="Find foods from USDA and OpenFoodFacts" />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
        <div className="space-y-2 text-center">
          <Search className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">Search Foods</h1>
          <p className="text-sm text-muted-foreground">Tap a result to adjust servings and log it to your meals.</p>
        </div>

        <form className="flex gap-2" onSubmit={(event) => event.preventDefault()}>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chicken breast, oatmeal, whey…"
            className="flex-1"
            data-testid="nutrition-search"
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
                <Button key={fav.id} variant="secondary" size="sm" onClick={() => setSelectedItem(fav.item)}>
                  {fav.item.name}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        {recents.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">Recent</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {recents.slice(0, 8).map((item) => (
                <Button key={item.id} variant="outline" size="sm" onClick={() => setSelectedItem(item)}>
                  {item.name}
                </Button>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Results</CardTitle>
            <div className="text-xs text-muted-foreground">{primaryCaption}</div>
          </CardHeader>
          <CardContent className="space-y-3">
            {status && <p className="text-xs text-muted-foreground">{status}</p>}
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching databases…
              </div>
            )}
            {loading && searchNotice && (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                {searchNotice}
              </p>
            )}

            {loading && !searchNotice && results?.length === 0 && query.trim().length > 0 && (
              <p className="text-sm text-muted-foreground">
                No matches. Try ‘chicken breast’, ‘rice’, or scan a barcode.
              </p>
            )}
            {!loading && !query.trim() && (
              <p className="text-sm text-muted-foreground">Enter a food name to begin.</p>
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
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{subtitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {roundKcal(base.kcal)} kcal · {roundGrams(base.protein)}g P · {roundGrams(base.carbs)}g C · {roundGrams(base.fat)}g F
                        &nbsp;<span className="text-[10px] text-muted-foreground">per 100 g</span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DemoWriteButton size="sm" variant="ghost" onClick={() => toggleFavorite(item)}>
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
          onConfirm={({ grams, quantity }) => handleLogFood(selectedItem, grams, quantity)}
        />
      )}
    </div>
  );
}
