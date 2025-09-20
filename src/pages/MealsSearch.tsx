import { FormEvent, useMemo, useState } from "react";
import { Search, Plus, Barcode } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { searchFoods, type NutritionItem } from "@/lib/nutritionShim";
import { addMeal } from "@/lib/nutrition";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const UNITS = ["serving", "g", "oz", "cups", "slices", "pieces"] as const;

function scaleNutrition(item: NutritionItem, quantity: number, unit: typeof UNITS[number]) {
  const perServing = item.perServing;
  const per100g = item.per100g;
  const calc = (base: number | null | undefined, factor: number) =>
    base == null ? undefined : Number((base * factor).toFixed(2));

  if (unit === "serving" || unit === "cups" || unit === "slices" || unit === "pieces" || !per100g) {
    return {
      calories: calc(perServing.kcal ?? null, quantity),
      protein: calc(perServing.protein_g ?? null, quantity),
      carbs: calc(perServing.carbs_g ?? null, quantity),
      fat: calc(perServing.fat_g ?? null, quantity),
    };
  }
  const grams = unit === "g" ? quantity : unit === "oz" ? quantity * 28.3495 : quantity;
  const factor = grams / 100;
  return {
    calories: calc(per100g?.kcal ?? perServing.kcal ?? null, factor),
    protein: calc(per100g?.protein_g ?? perServing.protein_g ?? null, factor),
    carbs: calc(per100g?.carbs_g ?? perServing.carbs_g ?? null, factor),
    fat: calc(per100g?.fat_g ?? perServing.fat_g ?? null, factor),
  };
}

export default function MealsSearch() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<NutritionItem[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [active, setActive] = useState<NutritionItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [unit, setUnit] = useState<typeof UNITS[number]>("serving");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const items = await searchFoods(query.trim());
      setResults(items);
      if (!items.length) {
        toast({ title: "No matches", description: "Try another food name." });
      }
    } catch (error: any) {
      toast({ title: "Search failed", description: error?.message || "Please try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const openDialog = (item: NutritionItem) => {
    setActive(item);
    setQuantity(1);
    setUnit("serving");
    setDialogOpen(true);
  };

  const confirmAdd = async () => {
    if (!active) return;
    const macros = scaleNutrition(active, quantity, unit);
    try {
      await addMeal(today, {
        name: active.name,
        protein: macros.protein,
        carbs: macros.carbs,
        fat: macros.fat,
        calories: macros.calories,
      });
      toast({ title: "Meal logged", description: `${active.name} added` });
      setDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Unable to add", description: error?.message || "Try again", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Food Search" description="Find foods from USDA and OpenFoodFacts" />
      <AppHeader />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <div className="space-y-2 text-center">
          <Search className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">Search Foods</h1>
          <p className="text-sm text-muted-foreground">Tap a result to log with adjustable serving sizes.</p>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chicken breast, oatmeal, whey..."
            className="flex-1"
          />
          <Button type="submit" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </Button>
        </form>

        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle>Results</CardTitle>
            <Button variant="outline" size="sm" asChild>
              <a href="/barcode">
                <Barcode className="mr-2 h-4 w-4" />
                Scan Barcode
              </a>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <p className="text-sm text-muted-foreground">Searching databases…</p>}
            {!loading && !results.length && <p className="text-sm text-muted-foreground">Enter a food name to begin.</p>}
            {results.map((item) => (
              <Card key={item.id} className="border">
                <CardContent className="flex items-center justify-between gap-4 py-4">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.brand || item.source}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.perServing.kcal ?? "—"} kcal • {item.perServing.protein_g ?? "—"}g P • {item.perServing.carbs_g ?? "—"}g C • {item.perServing.fat_g ?? "—"}g F
                    </p>
                  </div>
                  <Button size="sm" onClick={() => openDialog(item)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </CardContent>
              </Card>
            ))}
          </CardContent>
        </Card>
      </main>
      <BottomNav />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {active?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="0"
                  step="0.1"
                  value={quantity}
                  onChange={(event) => setQuantity(Number(event.target.value) || 0)}
                />
              </div>
              <div>
                <Label htmlFor="unit">Unit</Label>
                <Select value={unit} onValueChange={(value) => setUnit(value as typeof UNITS[number])}>
                  <SelectTrigger id="unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Nutrients based on database serving. Units other than grams/ounces use database serving equivalents.
            </p>
          </div>
          <DialogFooter>
            <Button onClick={confirmAdd}>Log Food</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
