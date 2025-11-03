import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface BarcodeScannerProps {
  onBarcodeScanned: (barcode: string) => void;
}

type ScannerMode = "idle" | "loading" | "detector" | "zxing" | "unsupported";

type ZXingControls = { stop: () => void } | null;

export function BarcodeScanner({ onBarcodeScanned }: BarcodeScannerProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [scannerMode, setScannerMode] = useState<ScannerMode>("idle");
  const [scannerError, setScannerError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const controlsRef = useRef<ZXingControls>(null);

  const cleanupStream = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (controlsRef.current) {
      try {
        controlsRef.current.stop();
      } catch {
        /* ignore */
      }
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {
        /* ignore */
      }
      videoRef.current.srcObject = null;
    }
    setScannerMode("idle");
  };

  useEffect(() => {
    if (!isOpen) {
      cleanupStream();
      setScannerError(null);
      setManualBarcode("");
    }
  }, [isOpen]);

  useEffect(() => () => cleanupStream(), []);

  const handleDetected = (code: string) => {
    cleanupStream();
    setScannerError(null);
    setManualBarcode("");
    setIsOpen(false);
    onBarcodeScanned(code);
  };

  const startDetector = async (Detector: any) => {
    const detector = new Detector({ formats: ["ean_13", "upc_a", "upc_e"] });
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
    }
    setScannerMode("detector");

    const scan = async () => {
      if (!videoRef.current) return;
      try {
        const results = await detector.detect(videoRef.current);
        const match = Array.isArray(results) ? results.find((item: any) => item.rawValue) : null;
        if (match?.rawValue) {
          handleDetected(match.rawValue);
          return;
        }
      } catch (error) {
        console.warn("barcode_detector_error", error);
      }
      rafRef.current = requestAnimationFrame(scan);
    };

    rafRef.current = requestAnimationFrame(scan);
  };

  const startZxing = async () => {
    const { BrowserMultiFormatReader, BarcodeFormat, DecodeHintType } = await import("@zxing/browser");
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]);
    const reader = new BrowserMultiFormatReader(hints, 300);
    setScannerMode("zxing");
    const controls = await reader.decodeFromVideoDevice(
      null,
      videoRef.current!,
      (result) => {
        const text = result?.getText?.();
        if (text) {
          handleDetected(text);
        }
      },
      {
        videoConstraints: {
          facingMode: "environment",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      },
    );
    controlsRef.current = {
      stop: () => {
        try {
          controls.stop();
        } catch {
          /* ignore */
        }
        reader.reset();
      },
    };
  };

  const startScanning = async () => {
    setScannerError(null);
    setScannerMode("loading");
    try {
      let Detector: any = (window as unknown as { BarcodeDetector?: any }).BarcodeDetector;
      if (!Detector) {
        try {
          const polyfill = await import("barcode-detector-polyfill");
          Detector = polyfill.BarcodeDetector || polyfill.default;
        } catch (error) {
          console.warn("barcode_polyfill_error", error);
        }
      }

      if (Detector) {
        await startDetector(Detector);
        return;
      }

      await startZxing();
    } catch (error) {
      console.error("barcode_scanner_init_error", error);
      cleanupStream();
      setScannerMode("unsupported");
      setScannerError("Camera scanning unavailable on this device. Enter the code manually.");
    }
  };

  const handleManualSubmit = () => {
    if (manualBarcode.length >= 8 && manualBarcode.length <= 14) {
      onBarcodeScanned(manualBarcode);
      setManualBarcode("");
      setIsOpen(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Camera className="w-4 h-4 mr-2" />
          {t('meals.scanBarcode')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scan Barcode</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(scannerMode === "detector" || scannerMode === "zxing") && (
            <div className="rounded-lg border bg-muted/40 p-3">
              <video ref={videoRef} className="w-full rounded" muted playsInline autoPlay />
              <p className="mt-2 text-xs text-muted-foreground">Point the camera at the barcode.</p>
              <Button variant="secondary" className="mt-3" onClick={cleanupStream}>
                Stop scanning
              </Button>
            </div>
          )}

          {scannerMode === "loading" && (
            <div className="bg-muted rounded-lg p-6 text-center text-sm text-muted-foreground">
              Initializing camera…
            </div>
          )}

          {scannerMode === "idle" && (
            <div className="bg-muted rounded-lg p-8 text-center">
              <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-sm text-muted-foreground">Use your camera to scan a barcode.</p>
              <Button className="mt-4" onClick={startScanning}>
                Start scanning
              </Button>
            </div>
          )}

          {scannerMode === "unsupported" && (
            <div className="rounded-lg border border-dashed border-muted-foreground/40 p-4 text-sm text-muted-foreground">
              Camera scanning isn’t supported on this device. Enter the barcode manually below.
            </div>
          )}

          {scannerError && <p className="text-sm text-destructive">{scannerError}</p>}

          <div className="space-y-2">
            <Label htmlFor="manual-barcode">Or enter barcode manually</Label>
            <Input
              id="manual-barcode"
              placeholder="Enter 8-14 digit barcode"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value.replace(/\D/g, ""))}
              maxLength={14}
            />
          </div>

          <Button
            onClick={handleManualSubmit}
            disabled={manualBarcode.length < 8 || manualBarcode.length > 14}
            className="w-full"
          >
            Search
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
