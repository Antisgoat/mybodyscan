import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Flashlight, FlashlightOff, Square, Play, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { backend } from "@/lib/backendBridge";
import { sanitizeFoodItem as sanitizeFoodRecord } from "@/features/nutrition/sanitize";
import { sanitizeFoodItem as sanitizeFoodQuery } from "@/lib/nutrition/sanitize";
import type { FoodItem } from "@/lib/nutrition/types";
import { addMeal } from "@/lib/nutritionBackend";
import { Seo } from "@/components/Seo";
import { defaultCountryFromLocale } from "@/lib/locale";
import { ServingEditor } from "@/components/nutrition/ServingEditor";

async function loadZXing() {
  try {
    return await import("@zxing/browser");
  } catch (error) {
    console.warn("ZXing import failed", error);
    return null as any;
  }
}

function buildFoodItemFromSanitized(
  code: string,
  raw: any,
  normalized: NonNullable<ReturnType<typeof sanitizeFoodRecord>>,
): FoodItem {
  const basePer100g = {
    kcal: normalized?.kcal ?? 0,
    protein: normalized?.protein_g ?? 0,
    carbs: normalized?.carbs_g ?? 0,
    fat: normalized?.fat_g ?? 0,
  };
  const perServing = {
    kcal: normalized?.kcal ?? null,
    protein_g: normalized?.protein_g ?? null,
    carbs_g: normalized?.carbs_g ?? null,
    fat_g: normalized?.fat_g ?? null,
  };
  const rawId = typeof raw?.id === "string" ? raw.id.trim() : "";
  const rawCode = typeof raw?.code === "string" ? raw.code.trim() : "";
  const id = rawId || rawCode || `barcode:${code}`;
  const source = typeof raw?.source === "string" && raw.source.trim().length ? raw.source : "Barcode";
  return {
    id,
    name: normalized?.name || `Barcode ${code}`,
    brand: normalized?.brand || null,
    source,
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
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number>();
  const zxingControlsRef = useRef<{ stop?: () => void } | null>(null);
  const scanningRef = useRef(false);
  const [manualCode, setManualCode] = useState("");
  const [running, setRunning] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [item, setItem] = useState<FoodItem | null>(null);
  const [loadingItem, setLoadingItem] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scannerUnavailable, setScannerUnavailable] = useState(false);

  const unavailableMessage = "Scanner unavailable — use manual barcode entry below.";
  const insecureMessage = "Camera not available — enter barcode manually.";

  const defaultCountry = useMemo(
    () => defaultCountryFromLocale(typeof navigator !== "undefined" ? navigator.language : undefined),
    [],
  );

  const fetchItem = useCallback(
    async (code: string) => {
      setLoadingItem(true);
      setItem(null);
      setStatus("Looking up…");
      try {
        const normalizedCode = sanitizeFoodQuery(code);
        if (!normalizedCode) {
          setStatus("Invalid barcode");
          toast({ title: "Invalid barcode", description: "Enter a valid UPC/EAN." });
          return;
        }
        setStatus(`Looking up barcode ${normalizedCode}…`);
        const { item, items } = await backend.nutritionBarcode({ upc: normalizedCode });
        const list = items ?? (item ? [item] : []);
        const normalized = list
          .map((entry: any) => ({ raw: entry, normalized: sanitizeFoodRecord(entry) }))
          .filter(
            (entry): entry is { raw: any; normalized: NonNullable<ReturnType<typeof sanitizeFoodRecord>> } =>
              Boolean(entry.normalized),
          );
        if (!normalized.length) {
          setStatus("No match found.");
          toast({ title: "No match", description: "Try manual entry or search." });
          return;
        }
        const { raw: rawItem, normalized: normalizedItem } = normalized[0];
        const food = buildFoodItemFromSanitized(normalizedCode, rawItem, normalizedItem);
        setItem(food);
        setStatus(typeof rawItem?.message === "string" ? rawItem.message : "Lookup complete");
      } catch (error: any) {
        toast({ title: "Lookup failed", description: error?.message || "Try again", variant: "destructive" });
        setStatus("Lookup failed. Try again.");
      } finally {
        setLoadingItem(false);
      }
    },
    [toast],
  );

  const stopScanner = useCallback(() => {
    scanningRef.current = false;
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = undefined;
    }
    if (zxingControlsRef.current) {
      try {
        zxingControlsRef.current.stop?.();
      } catch {}
      zxingControlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setRunning(false);
    setTorchOn(false);
    setTorchAvailable(false);
  }, []);

  const handleDetected = useCallback(
    (code: string) => {
      if (!code) return;
      setDetectedCode(code);
      stopScanner();
      void fetchItem(code);
    },
    [fetchItem, stopScanner],
  );

  const startWithBarcodeDetector = useCallback(async () => {
    const Detector = (window as any).BarcodeDetector;
    if (!Detector) throw new Error("detector_unavailable");
    const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "code_128", "code_39"] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setRunning(true);
    scanningRef.current = true;
    const track = stream.getVideoTracks()[0];
    if (track?.getCapabilities) {
      const caps = track.getCapabilities() as any;
      setTorchAvailable(Boolean(caps?.torch));
    } else {
      setTorchAvailable(false);
    }

    const scan = async () => {
      if (!scanningRef.current || !videoRef.current) return;
      try {
        const results = await detector.detect(videoRef.current);
        if (Array.isArray(results) && results.length) {
          const code = results[0]?.rawValue;
          if (code) {
            handleDetected(code);
            return;
          }
        }
      } catch (error) {
        console.error("barcode_detect_error", error);
      }
      frameRef.current = requestAnimationFrame(scan);
    };

    frameRef.current = requestAnimationFrame(scan);
  }, [handleDetected]);

  const startWithZxing = useCallback(async () => {
    const mod = await loadZXing();
    if (!mod) {
      setScannerUnavailable(true);
      setScannerError(unavailableMessage);
      return false;
    }
    try {
      const reader = new mod.BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoDevice(null, videoRef.current!, (result, err, ctrl) => {
        if (result) {
          handleDetected(result.getText());
          ctrl?.stop?.();
        } else if (err && !(err instanceof mod.NotFoundException)) {
          console.error("zxing_scan_error", err);
        }
      });
      zxingControlsRef.current = controls;
      streamRef.current = (controls as any)?.stream ?? streamRef.current;
      setTorchAvailable(false);
      setRunning(true);
      scanningRef.current = true;
      return true;
    } catch (error) {
      console.error("zxing_loader_error", error);
      setScannerError("Unable to start ZXing scanner. Enter code manually.");
      setScannerUnavailable(true);
      return false;
    }
  }, [handleDetected, unavailableMessage]);

  const startScanner = useCallback(async () => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setScannerUnavailable(true);
      setScannerError(insecureMessage);
      return;
    }
    setScannerUnavailable(false);
    setScannerError(null);
    setDetectedCode(null);
    stopScanner();
    try {
      if ("BarcodeDetector" in window) {
        await startWithBarcodeDetector();
        return;
      }
      const started = await startWithZxing();
      if (!started) {
        stopScanner();
      }
    } catch (error: any) {
      console.error("scanner_start_failed", error);
      setScannerUnavailable(true);
      setScannerError(unavailableMessage);
      stopScanner();
    }
  }, [insecureMessage, startWithBarcodeDetector, startWithZxing, stopScanner, unavailableMessage]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track?.applyConstraints) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((prev) => !prev);
    } catch (error) {
      console.error("torch_toggle_error", error);
      toast({ title: "Torch unsupported", description: "Use additional light if needed." });
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
    if (typeof window !== "undefined") {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setScannerUnavailable(true);
        setScannerError(insecureMessage);
      }
    }
    return () => {
      stopScanner();
    };
  }, [insecureMessage, stopScanner, unavailableMessage]);

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
            <Button size="sm" variant={running ? "outline" : "default"} onClick={running ? stopScanner : startScanner}>
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
          <div className="relative h-72 w-full overflow-hidden rounded-lg bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-0 border-2 border-white/40" />
          </div>
          <p className="text-xs text-muted-foreground">
            {running
              ? "Scanning…"
              : scannerError
              ? scannerError
              : scannerUnavailable
              ? unavailableMessage
              : "Tap start to begin scanning"}
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
              <Label htmlFor="manual-code">Enter barcode manually</Label>
              <Input
                id="manual-code"
                inputMode="numeric"
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
