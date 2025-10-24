import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Flashlight, FlashlightOff, Square, Play, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { lookupBarcode } from "@/lib/nutrition";
import type { FoodItem as SearchFoodItem } from "@/lib/nutrition";
import type { FoodItem } from "@/lib/nutrition/types";
import { addMeal } from "@/lib/nutritionBackend";
import { Seo } from "@/components/Seo";
import { defaultCountryFromLocale } from "@/lib/locale";
import { ServingEditor } from "@/components/nutrition/ServingEditor";

const SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.2.11/dist/quagga.min.js";

function adaptFoodItem(raw: SearchFoodItem): FoodItem {
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

export default function BarcodeScan() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [quaggaReady, setQuaggaReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [item, setItem] = useState<FoodItem | null>(null);
  const [loadingItem, setLoadingItem] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [processing, setProcessing] = useState(false);

  const defaultCountry = useMemo(
    () => defaultCountryFromLocale(typeof navigator !== "undefined" ? navigator.language : undefined),
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).Quagga) {
      setQuaggaReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => setQuaggaReady(true);
    script.onerror = () => toast({ title: "Scanner unavailable", description: "Unable to load barcode library." });
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  const teardown = useCallback(() => {
    const Quagga = (window as any).Quagga;
    if (Quagga?.stop) {
      Quagga.stop();
    }
    setRunning(false);
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const onDetected = useCallback(
    async (data: any) => {
      const code = data?.codeResult?.code;
      if (!code) return;
      setDetectedCode(code);
      teardown();
      await fetchItem(code);
    },
    [teardown],
  );

  const startScanner = useCallback(() => {
    const Quagga = (window as any).Quagga;
    if (!Quagga || !containerRef.current) {
      toast({ title: "Scanner not ready", description: "Library not loaded" });
      return;
    }
    Quagga.init(
      {
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: containerRef.current,
          constraints: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        decoder: {
          readers: ["ean_reader", "upc_reader", "upc_e_reader", "code_128_reader"],
        },
        locate: true,
      },
      (err: Error | null) => {
        if (err) {
          console.error("quagga_init_error", err);
          toast({ title: "Camera unavailable", description: "Check permissions or try manual entry." });
          return;
        }
        Quagga.start();
        setRunning(true);
        Quagga.onDetected(onDetected);
        const track = Quagga.CameraAccess?.getActiveTrack?.();
        if (track && track.getCapabilities) {
          const caps = track.getCapabilities();
          if ((caps as any).torch) {
            setTorchAvailable(true);
          }
        }
      },
    );
  }, [onDetected]);

  const stopScanner = () => {
    const Quagga = (window as any).Quagga;
    if (Quagga?.offDetected) {
      Quagga.offDetected(onDetected);
    }
    teardown();
  };

  const toggleTorch = async () => {
    const Quagga = (window as any).Quagga;
    const track = Quagga?.CameraAccess?.getActiveTrack?.();
    if (!track?.applyConstraints) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((prev) => !prev);
    } catch (error) {
      console.error("torch_toggle_error", error);
      toast({ title: "Torch unsupported", description: "Use additional light if needed." });
    }
  };

  const fetchItem = async (code: string) => {
    setLoadingItem(true);
    setItem(null);
    setStatus("Looking up…");
    try {
      const result = await lookupBarcode(code);
      setStatus(result.status);
      const found = result.items[0] ? adaptFoodItem(result.items[0]) : null;
      setItem(found);
      if (!found) {
        toast({ title: "No match", description: "Try manual entry or search." });
      }
    } catch (error: any) {
      toast({ title: "Lookup failed", description: error?.message || "Try again", variant: "destructive" });
      setStatus("Lookup failed. Try again.");
    } finally {
      setLoadingItem(false);
    }
  };

  const handleManual = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualCode.trim()) return;
    await fetchItem(manualCode.trim());
  };

  const handleLog = async ({ meal }: any) => {
    if (!item) return;
    setProcessing(true);
    try {
      await addMeal(new Date().toISOString().slice(0, 10), { ...meal, entrySource: "barcode" });
      toast({ title: "Logged", description: `${item.name} added to today` });
    } catch (error: any) {
      toast({ title: "Unable to log", description: error?.message || "Try again", variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6 pb-20 md:pb-10">
      <Seo title="Barcode Scan" description="Scan UPCs to log foods" />
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Barcode Scanner</h1>
        <p className="text-muted-foreground">
          Align the barcode within the frame. Scanning defaults to region {defaultCountry}. Use the torch in low light or enter the code manually.
        </p>
      </header>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4" /> Live scanner
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant={running ? "outline" : "default"} onClick={running ? stopScanner : startScanner} disabled={!quaggaReady}>
              {running ? (
                <>
                  <Square className="mr-1 h-4 w-4" /> Stop
                </>
              ) : (
                <>
                  <Play className="mr-1 h-4 w-4" /> Start
                </>
              )}
            </Button>
            <Button size="sm" variant="ghost" onClick={toggleTorch} disabled={!torchAvailable}>
              {torchOn ? <FlashlightOff className="h-4 w-4" /> : <Flashlight className="h-4 w-4" />}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div ref={containerRef} className="relative h-72 w-full overflow-hidden rounded-lg bg-black">
            <div className="pointer-events-none absolute inset-0 border-2 border-white/40" />
          </div>
          <p className="text-xs text-muted-foreground">
            {running ? "Scanning…" : quaggaReady ? "Tap start to begin scanning" : "Loading scanner…"}
            {detectedCode ? ` • Last detected: ${detectedCode}` : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <form onSubmit={handleManual} className="flex gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="manual-code">Barcode</Label>
              <Input
                id="manual-code"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder={`Enter UPC (${defaultCountry})`}
              />
            </div>
            <Button type="submit" className="self-end" disabled={!manualCode.trim()}>
              Lookup
            </Button>
          </form>
          {status && <p className="text-xs text-muted-foreground">{status}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Result</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingItem && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking up food…
            </div>
          )}
          {!loadingItem && !item && <p className="text-sm text-muted-foreground">No food selected yet.</p>}
          {item && (
            <div className="space-y-3">
              <div>
                <p className="text-lg font-semibold text-foreground">{item.name}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.brand || item.source}</p>
                <p className="text-xs text-muted-foreground">
                  {item.per_serving.kcal ?? "—"} kcal • {item.per_serving.protein_g ?? "—"}g P • {item.per_serving.carbs_g ?? "—"}g C •
                  {item.per_serving.fat_g ?? "—"}g F
                </p>
              </div>
              <ServingEditor item={item} entrySource="barcode" onConfirm={handleLog} busy={processing} />
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
