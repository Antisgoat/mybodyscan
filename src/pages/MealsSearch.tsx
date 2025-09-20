import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Plus, Barcode, Loader2, Star, StarOff, ListPlus, Check, Trash } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { searchFoods, type NormalizedItem } from "@/lib/nutritionShim";
import { addMeal } from "@/lib/nutrition";
import {
  saveFavorite,
  removeFavorite,
  subscribeFavorites,
  type FavoriteDocWithId,
} from "@/lib/nutritionCollections";
import { ServingEditor } from "@/components/nutrition/ServingEditor";
import { type ServingUnit, calculateSelection } from "@/lib/nutritionMath";

const RECENTS_KEY = "mbs_nutrition_recents_v2";
const MAX_RECENTS = 50;

interface QueuedEntry {
  id: string;
  item: NormalizedItem;
  qty: number;
  unit: ServingUnit;
  macros: ReturnType<typeof calculateSelection>;
}

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogItem, setDialogItem] = useState<NormalizedItem | null>(null);
  const [queued, setQueued] = useState<QueuedEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [recents, setRecents] = useState<NormalizedItem[]>(() => readRecents());
  const [favorites, setFavorites] = useState<FavoriteDocWithId[]>([]);
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
        .catch((error) => {
          console.error(error);
          toast({ title: "Search failed", description: "Try another food", variant: "destructive" });
        })
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const openDialog = (item: NormalizedItem) => {
    setDialogItem(item);
    setDialogOpen(true);
  };

  const updateRecents = useCallback(
    (item: NormalizedItem) => {
      const next = [item, ...recents.filter((recent) => recent.id !== item.id)].slice(0, MAX_RECENTS);
      setRecents(next);
      storeRecents(next);
    },
    [recents],
  );

  const addToQueue = ({ qty, unit, result }: { qty: number; unit: ServingUnit; result: ReturnType<typeof calculateSelection> }) => {
    if (!dialogItem) return;
    const id = `${dialogItem.id}-${Date.now()}`;
    setQueued((prev) => [...prev, { id, item: dialogItem, qty, unit, macros: result }]);
    setDialogOpen(false);
  };

  const clearQueue = () => setQueued([]);

  const logEntries = async (entries: QueuedEntry[]) => {
    if (!entries.length) return;
    setProcessing(true);
    try {
      for (const entry of entries) {
        await addMeal(today, {
          name: entry.item.name,
          protein: entry.macros.protein ?? undefined,
          carbs: entry.macros.carbs ?? undefined,
          fat: entry.macros.fat ?? undefined,
          calories: entry.macros.calories ?? undefined,
          serving: {
            qty: entry.qty,
            unit: entry.unit,
            grams: entry.macros.grams,
            originalQty: entry.item.serving.qty ?? null,
            originalUnit: entry.item.serving.unit ?? null,
          },
          item: {
            id: entry.item.id,
            name: entry.item.name,
            brand: entry.item.brand,
            source: entry.item.source,
            serving: entry.item.serving,
            per_serving: entry.item.per_serving,
            per_100g: entry.item.per_100g ?? null,
            fdcId: entry.item.fdcId ?? null,
            gtin: entry.item.gtin ?? null,
          },
          entrySource: "search",
        });
        updateRecents(entry.item);
      }
      toast({ title: "Foods logged", description: `${entries.length} item(s) added` });
      setQueued((prev) => prev.filter((entry) => !entries.includes(entry)));
    } catch (error: any) {
      toast({ title: "Unable to log", description: error?.message || "Try again", variant: "destructive" });
    } finally {
      setProcessing(false);
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

  const queuedTotal = queued.reduce((sum, entry) => sum + (entry.macros.calories ?? 0), 0);

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
                <Button key={fav.id} variant="secondary" size="sm" onClick={() => openDialog(fav.item)}>
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
                <Button key={item.id} variant="outline" size="sm" onClick={() => openDialog(item)}>
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
              <p className="text-sm text-muted-foreground">
                No matches. Try alternate spelling or scan the barcode.
              </p>
            )}
            {!loading && !query.trim() && (
              <p className="text-sm text-muted-foreground">Enter a food name to begin.</p>
            )}
            {results.map((item) => {
              const favorite = favorites.find((fav) => fav.id === item.id);
              return (
                <Card key={item.id} className="border">
                  <CardContent className="flex flex-col gap-2 py-4 text-sm md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium text-foreground">{item.name}</p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.brand || item.source}</p>
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
                      <Button size="sm" onClick={() => openDialog(item)}>
                        <Plus className="mr-1 h-4 w-4" /> Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </CardContent>
        </Card>

        {queued.length > 0 && (
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <ListPlus className="h-4 w-4" /> Queued ({queued.length})
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={clearQueue} disabled={processing}>
                  Clear
                </Button>
                <Button size="sm" onClick={() => logEntries(queued)} disabled={processing}>
                  {processing ? "Logging…" : `Log all (${Math.round(queuedTotal)} kcal)`}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {queued.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <p className="font-medium text-foreground">{entry.item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.qty} {entry.unit} • {entry.macros.calories ?? "—"} kcal
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => logEntries([entry])}
                      disabled={processing}
                    >
                      <Check className="mr-1 h-4 w-4" /> Log
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setQueued((prev) => prev.filter((item) => item.id !== entry.id))}
                      disabled={processing}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add {dialogItem?.name}</DialogTitle>
          </DialogHeader>
          {dialogItem && <ServingEditor item={dialogItem} onConfirm={addToQueue} />}
        </DialogContent>
      </Dialog>
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
