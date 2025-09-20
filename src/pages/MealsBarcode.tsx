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
import { searchFoodsMock } from "@/lib/nutritionShim";

export default function MealsBarcode() {
  const { t } = useI18n();
  const [code, setCode] = useState("");
  const [manualResult, setManualResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code) return;
    setLoading(true);
    try {
      const results = await searchFoodsMock(code);
      setManualResult(results[0]?.name || null);
      toast({ title: "Barcode lookup stub", description: "Full scanner coming soon." });
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
          <div className="text-xs font-medium uppercase tracking-wide text-primary">Coming Soon</div>
          <h1 className="text-2xl font-semibold text-foreground">{t('meals.scanBarcode')}</h1>
          <p className="text-sm text-muted-foreground">
            Scan barcode (camera integration next sprint). Enter the UPC to try our mock lookup.
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
              <div className="font-medium text-foreground">Scanner mock</div>
              <p className="mt-1 text-xs">Point your camera at a barcode to add packaged foods instantly.</p>
            </div>
            {manualResult && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <div className="font-medium">Preview result</div>
                <div className="text-muted-foreground">{manualResult}</div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
      <BottomNav />
    </div>
  );
}
