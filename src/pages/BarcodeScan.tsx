import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { lookupBarcode } from "@/lib/nutritionShim";
import { addMeal } from "@/lib/nutrition";
import { Seo } from "@/components/Seo";
import { defaultCountryFromLocale } from "@/lib/locale";

export default function BarcodeScan() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [detectedCode, setDetectedCode] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const defaultCountry = useMemo(
    () => defaultCountryFromLocale(typeof navigator !== "undefined" ? navigator.language : undefined),
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).Quagga) {
      setScanning(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/@ericblade/quagga2@1.2.11/dist/quagga.min.js";
    script.async = true;
    script.onload = () => setScanning(true);
    script.onerror = () => toast({ title: "Scanner unavailable", description: "Unable to load barcode library." });
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, []);

  useEffect(() => {
    const Quagga = (window as any).Quagga;
    if (!scanning || !Quagga || !containerRef.current) return;
    Quagga.init(
      {
        inputStream: {
          name: "Live",
          type: "LiveStream",
          target: containerRef.current,
          constraints: {
            facingMode: "environment",
            width: 640,
            height: 480,
          },
        },
        decoder: {
          readers: ["ean_reader", "upc_reader", "upc_e_reader"],
        },
        locate: true,
      },
      (err) => {
        if (err) {
          console.error("quagga_init_error", err);
          toast({ title: "Camera unavailable", description: "Use manual entry instead." });
          setScanning(false);
          return;
        }
        Quagga.start();
        setScanning(true);
      }
    );

    const onDetected = (data: any) => {
      const code = data?.codeResult?.code;
      if (code) {
        setDetectedCode(code);
        Quagga.stop();
        setScanning(false);
        fetchResult(code);
      }
    };

    Quagga.onDetected(onDetected);
    return () => {
      Quagga.offDetected(onDetected);
      if (Quagga.running) {
        Quagga.stop();
      }
    };
  }, [scanning]);

  const fetchResult = async (code: string) => {
    try {
      const item = await lookupBarcode(code);
      setResult(item);
      if (!item) {
        toast({ title: "No match", description: "Try manual entry" });
      }
    } catch (error: any) {
      toast({ title: "Lookup failed", description: error?.message || "Try again" });
    }
  };

  const handleManualSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualCode) return;
    await fetchResult(manualCode);
  };

  const handleAdd = async () => {
    if (!result) return;
    const today = new Date().toISOString().slice(0, 10);
    try {
      await addMeal(today, {
        name: result.name,
        protein: result.perServing.protein_g ?? undefined,
        carbs: result.perServing.carbs_g ?? undefined,
        fat: result.perServing.fat_g ?? undefined,
        calories: result.perServing.kcal ?? undefined,
      });
      toast({ title: "Logged", description: `${result.name} added to today` });
    } catch (error: any) {
      toast({ title: "Unable to log", description: error?.message || "Try again" });
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
      <Seo title="Barcode Scan" description="Scan UPC to log foods" />
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Barcode Scanner</h1>
        <p className="text-muted-foreground">
          Align the barcode within the frame. The camera will focus automatically. If scanning fails, enter the code manually.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Live Scanner</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div ref={containerRef} className="h-64 w-full overflow-hidden rounded-lg bg-black" />
          <p className="text-xs text-muted-foreground">
            {scanning ? "Scanning... tap to refocus" : detectedCode ? `Detected ${detectedCode}` : "Camera inactive"}
          </p>
          <p className="text-xs text-muted-foreground">Default region: {defaultCountry}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="manual-code">Barcode</Label>
              <Input
                id="manual-code"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder={`Enter UPC (${defaultCountry})`}
              />
            </div>
            <Button type="submit" className="self-end">
              Lookup
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>{result.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{result.brand || "Unknown brand"}</p>
            <p>
              {result.perServing.kcal ?? "—"} kcal • {result.perServing.protein_g ?? "—"}g protein • {result.perServing.carbs_g ?? "—"}
              g carbs • {result.perServing.fat_g ?? "—"}g fat
            </p>
            <Button onClick={handleAdd} className="w-full">
              Add to Today
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}
