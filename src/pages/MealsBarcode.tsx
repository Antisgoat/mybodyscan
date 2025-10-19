import { FormEvent, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { lookupBarcode, searchFoods, type NormalizedItem } from "@/lib/nutritionShim";
import { roundGrams, roundKcal } from "@/lib/nutritionMath";

export default function MealsBarcode() {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [manualResult, setManualResult] = useState<NormalizedItem | null>(null);
  const [fallbackCount, setFallbackCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    setManualResult(null);
    setFallbackCount(0);
    try {
      const barcodeMatch = await lookupBarcode(trimmed);
      if (barcodeMatch) {
        setManualResult(barcodeMatch);
        toast({
          title: "Barcode match",
          description: `Source: ${barcodeMatch.source}`,
        });
        return;
      }

      const results = await searchFoods(trimmed);
      if (!results.length) {
        toast({ title: "No match found", description: "No match; try manual search", variant: "destructive" });
        return;
      }
      setManualResult(results[0] ?? null);
      setFallbackCount(results.length);
      toast({ title: "Matched from search", description: "Review and confirm the item." });
    } catch (error: any) {
      toast({ title: "Lookup failed", description: error?.message || "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="Barcode Scan - MyBodyScan" description="Scan packaged foods to log meals" />
      <AppHeader />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <DemoBanner />
        <div className="space-y-2 text-center">
          <div className="text-xs font-medium uppercase tracking-wide text-primary">Beta</div>
          <h1 className="text-2xl font-semibold text-foreground">{t('meals.scanBarcode')}</h1>
          <p className="text-sm text-muted-foreground">
            Scan barcode (camera integration next sprint). Enter the UPC to search our nutrition partners.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 py-6">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Manual UPC entry"
              />
              <Button type="submit" disabled={loading}>
                {loading ? "Searching" : "Lookup"}
              </Button>
            </form>
            <div className="rounded-md border border-dashed border-muted-foreground/40 p-4 text-center text-sm text-muted-foreground">
              <div className="font-medium text-foreground">Scanner preview</div>
              <p className="mt-1 text-xs">Point your camera at a barcode to add packaged foods instantly.</p>
            </div>
            {manualResult && (
              <div className="space-y-2 rounded-md bg-muted p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-foreground">{manualResult.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {manualResult.brand || (manualResult.source === "OFF" ? "Open Food Facts" : "USDA")}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      manualResult.source === "USDA"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-green-100 text-green-800"
                    }`}
                  >
                    {manualResult.source}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    {manualResult.per_serving.kcal != null
                      ? `${roundKcal(manualResult.per_serving.kcal)} kcal`
                      : `${roundKcal(manualResult.basePer100g.kcal)} kcal per 100 g`}
                  </div>
                  <div>{roundGrams(manualResult.per_serving.protein_g ?? manualResult.basePer100g.protein)}g protein</div>
                  <div>{roundGrams(manualResult.per_serving.carbs_g ?? manualResult.basePer100g.carbs)}g carbs</div>
                  <div>{roundGrams(manualResult.per_serving.fat_g ?? manualResult.basePer100g.fat)}g fat</div>
                </div>
                {manualResult.serving?.text && (
                  <div className="text-xs text-muted-foreground">
                    Serving: {manualResult.serving.text}
                    {manualResult.serving.qty ? ` (${manualResult.serving.qty} ${manualResult.serving.unit || "g"})` : ""}
                  </div>
                )}
                {fallbackCount > 1 && (
                  <div className="text-xs text-muted-foreground">
                    Showing the top match from {fallbackCount} nutrition search results.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
