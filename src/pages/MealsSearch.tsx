import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Barcode, Loader2, Star, StarOff } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { fetchFoods } from "@/lib/api";
import type { FoodItem, ServingOption } from "@/lib/nutrition/types";
import {
  saveFavorite,
  removeFavorite,
  subscribeFavorites,
  type FavoriteDocWithId,
} from "@/lib/nutritionCollections";
import { useDemoMode } from "@/components/DemoModeProvider";
import { auth, db } from "@/lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

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

function round(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function calculateMacros(base: FoodItem["basePer100g"], grams: number) {
  if (!grams || grams <= 0) {
    return { grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 };
  }
  const factor = grams / 100;
  return {
    grams: round(grams, 2),
    kcal: Math.round(base.kcal * factor),
    protein: round(base.protein * factor),
    carbs: round(base.carbs * factor),
    fat: round(base.fat * factor),
  };
}

function ouncesDisplay(grams: number) {
  if (!grams || grams <= 0) return null;
  return round(grams * OUNCES_IN_GRAM, 2);
}

function findCupServing(servings: ServingOption[]): ServingOption | undefined {
  return servings.find((option) => option.label.toLowerCase().includes("cup"));
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
              {macros.grams ? `${macros.grams} g` : "0 g"}
              {ounces ? ` · ${ounces} oz` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
              <span>{macros.kcal} kcal</span>
              <span>{macros.protein}g P</span>
              <span>{macros.carbs}g C</span>
              <span>{macros.fat}g F</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => onConfirm({ grams: grams, quantity })}
              disabled={busy || disableAdd}
            >
              {busy ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function MealsSearch() {
  const demo = useDemoMode();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<FoodItem[]>([]);
  const [primarySource, setPrimarySource] = useState<"USDA" | "Open Food Facts" | null>(null);
  const [recents, setRecents] = useState<FoodItem[]>(() => readRecents());
  const [favorites, setFavorites] = useState<FavoriteDocWithId[]>([]);
  const [selectedItem, setSelectedItem] = useState<FoodItem | null>(null);
  const [logging, setLogging] = useState(false);

  useEffect(() => {
    try {
      const unsub = subscribeFavorites(setFavorites);
      return () => unsub?.();
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
      setPrimarySource(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;
    const handle = window.setTimeout(() => {
      fetchFoods(trimmed)
        .then((items) => {
          if (cancelled) return;
          setResults(items);
          setPrimarySource(items.length ? (items[0]!.source as "USDA" | "Open Food Facts") : null);
        })
        .catch((error) => {
          if (cancelled) return;
          if (!(error instanceof DOMException && error.name === "AbortError")) {
            console.error("nutrition_search_error", error);
            toast({ title: "Search failed", description: "Try another food", variant: "destructive" });
          }
          setResults([]);
          setPrimarySource(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  const updateRecents = (item: FoodItem) => {
    const next = [item, ...recents.filter((recent) => recent.id !== item.id)].slice(0, MAX_RECENTS);
    setRecents(next);
    storeRecents(next);
  };

  const toggleFavorite = async (item: FoodItem) => {
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

    const user = auth.currentUser;
    if (!user) {
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
        grams: Math.round(totalGrams * 100) / 100,
        kcal: macros.kcal,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
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
      ? "OFF primary · USDA unavailable"
      : "USDA primary · OFF fallback";

  const favoritesMap = useMemo(() => new Map(favorites.map((fav) => [fav.id, fav])), [favorites]);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo title="Food Search" description="Find foods from USDA and OpenFoodFacts" />
      <AppHeader />
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
            {loading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching databases…
              </div>
            )}
            {!loading && results.length === 0 && query.trim().length > 0 && (
              <p className="text-sm text-muted-foreground">
                No matches. Try ‘chicken breast’, ‘rice’, or scan a barcode.
              </p>
            )}
            {!loading && !query.trim() && (
              <p className="text-sm text-muted-foreground">Enter a food name to begin.</p>
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
                        {Math.round(base.kcal)} kcal · {round(base.protein)}g P · {round(base.carbs)}g C · {round(base.fat)}g F
                        &nbsp;<span className="text-[10px] text-muted-foreground">per 100 g</span>
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
