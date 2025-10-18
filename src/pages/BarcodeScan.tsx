import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Flashlight, FlashlightOff, Square, Play, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@app/components/ui/card.tsx";
import { Button } from "@app/components/ui/button.tsx";
import { Input } from "@app/components/ui/input.tsx";
import { Label } from "@app/components/ui/label.tsx";
import { toast } from "@app/hooks/use-toast.ts";
import { lookupBarcode } from "@app/lib/nutritionShim.ts";
import type { FoodItem } from "@app/lib/nutrition/types.ts";
import { addMeal } from "@app/lib/nutrition.ts";
import { Seo } from "@app/components/Seo.tsx";
import { defaultCountryFromLocale } from "@app/lib/locale.ts";
import { ServingEditor } from "@app/components/nutrition/ServingEditor.tsx";

const SCRIPT_SRC = "https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.2.11/dist/quagga.min.js";

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
    try {
      const found = await lookupBarcode(code);
      setItem(found);
      if (!found) {
        toast({ title: "No match", description: "Try manual entry or search." });
      }
    } catch (error: any) {
      toast({ title: "Lookup failed", description: error?.message || "Try again", variant: "destructive" });
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
        <CardContent>
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
