import { FormEvent, useState } from "react";
import { Search, Plus } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { addEntryMock, searchFoodsMock, type MockFoodItem } from "@/lib/nutritionShim";
import { isDemoGuest } from "@/lib/demoFlag";

export default function MealsSearch() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<MockFoodItem[]>([]);

  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!query) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const items = await searchFoodsMock(query);
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

  const handleAdd = async (item: MockFoodItem) => {
    try {
      await addEntryMock(item);
      toast({ title: "Added to diary", description: `${item.calories} kcal logged from ${item.source.toUpperCase()}` });
      if (isDemoGuest()) {
        toast({ title: "Demo mode", description: "Sign up to save meals to your account." });
      }
    } catch (error: any) {
      toast({ title: "Unable to add", description: error?.message || "Please try again", variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Meal Search - MyBodyScan" description="Find foods from USDA or Open Food Facts" />
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <DemoBanner />
        <div className="space-y-2 text-center">
          <Search className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-2xl font-semibold text-foreground">{t('meals.search')}</h1>
          <p className="text-sm text-muted-foreground">Search USDA + Open Food Facts. Barcode scans coming soon.</p>
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

        <div className="space-y-3">
          {loading && (
            <Card>
              <CardContent className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
                Searching nutrition databases…
              </CardContent>
            </Card>
          )}

          {!loading && results.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Enter a food name to see suggested matches.
              </CardContent>
            </Card>
          )}

          {results.map((item) => (
            <Card key={item.id}>
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div>
                  <div className="font-medium text-foreground">{item.name}</div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{item.source}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.calories} kcal • {item.protein}g P • {item.carbs}g C • {item.fat}g F
                  </div>
                </div>
                <Button size="sm" onClick={() => handleAdd(item)}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
