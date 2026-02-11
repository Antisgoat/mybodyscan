import { FormEvent, useState } from "react";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { useI18n } from "@/lib/i18n";
import { searchFoods } from "@/lib/nutrition";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { useDemoMode } from "@/components/DemoModeProvider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const STATUS_CLASS = "text-xs text-muted-foreground";

export default function MealsBarcode() {
  const { t } = useI18n();
  const demo = useDemoMode();
  const { health: systemHealth } = useSystemHealth();
  const { nutritionConfigured } = computeFeatureStatuses(
    systemHealth ?? undefined
  );
  const lookupsBlocked = demo || nutritionConfigured === false;
  const blockedMessage = demo
    ? "Barcode lookup is disabled in demo mode. Sign in to try the live nutrition database."
    : "Backend unavailable (Cloud Functions). Check deployment / network.";
  const [code, setCode] = useState("");
  const [manualResult, setManualResult] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!code) return;
    if (lookupsBlocked) {
      setStatus(blockedMessage);
      return;
    }
    setLoading(true);
    try {
      setStatus("Searching…");
      const result = await searchFoods(code);
      setStatus(result.status);
      setManualResult(result.items[0]?.name || null);
      if (!result.items.length) {
        toast({
          title: "No match found",
          description: "Try another UPC or add manually.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Barcode match",
        description: "Review and confirm the item.",
      });
    } catch (error: any) {
      toast({
        title: "Lookup failed",
        description: error?.message || "Try again",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo
        title="Barcode Scan - MyBodyScan"
        description="Scan packaged foods to log meals"
      />
      <main className="mx-auto flex max-w-md flex-col gap-6 p-6">
        <DemoBanner />
        {lookupsBlocked && (
          <Alert variant="destructive">
            <AlertTitle>Nutrition search unavailable</AlertTitle>
            <AlertDescription>{blockedMessage}</AlertDescription>
          </Alert>
        )}
        <div className="space-y-2 text-center">
          <div className="text-xs font-medium uppercase tracking-wide text-primary">
            Beta
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t("meals.scanBarcode")}
          </h1>
          <p className="text-sm text-muted-foreground">
            Scan barcode (camera integration next sprint). Enter the UPC to
            search our nutrition partners.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-4 py-6">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Manual UPC entry"
                disabled={lookupsBlocked}
              />
              <Button
                type="submit"
                disabled={loading || lookupsBlocked}
                title={lookupsBlocked ? blockedMessage : undefined}
              >
                {loading ? "Searching" : "Lookup"}
              </Button>
            </form>
            <div className="rounded-md border border-dashed border-muted-foreground/40 p-4 text-center text-sm text-muted-foreground">
              <div className="font-medium text-foreground">Scanner preview</div>
              <p className="mt-1 text-xs">
                Point your camera at a barcode to add packaged foods instantly.
              </p>
            </div>
            {status && <p className={STATUS_CLASS}>{status}</p>}
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
