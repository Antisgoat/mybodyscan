import React from "react";
import { Button } from "@/components/ui/button";

interface Props {
  onResult: (code: string) => void;
  onError: (msg: string) => void;
}

export function BarcodeScanner({ onResult, onError }: Props) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [running, setRunning] = React.useState(false);
  const runningRef = React.useRef(false);

  const stop = React.useCallback(() => {
    setRunning(false);
    runningRef.current = false;
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startNativeDetector = React.useCallback(async () => {
    // @ts-expect-error -- BarcodeDetector is an experimental browser API
    if (!("BarcodeDetector" in window)) return false;
    try {
      // @ts-expect-error -- BarcodeDetector may not exist in all browsers
      const detector = new window.BarcodeDetector({
        formats: ["ean_13", "upc_a", "upc_e", "ean_8", "code_128"],
      });
      const loop = async () => {
        if (!runningRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          const value = codes?.[0]?.rawValue;
          if (value) {
            stop();
            onResult(value);
            return;
          }
        } catch (error) {
          console.debug("barcode_detect_tick_error", error);
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      return true;
    } catch (error) {
      console.warn("barcode_native_init_failed", error);
      return false;
    }
  }, [onResult, stop]);

  const start = React.useCallback(async () => {
    try {
      setRunning(true);
      runningRef.current = true;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const handledByNative = await startNativeDetector();
      if (handledByNative) return;

      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const result = await reader.decodeOnceFromVideoDevice(
        undefined,
        videoRef.current!
      );
      stop();
      onResult(result.getText());
    } catch (error) {
      console.error("barcode_start_error", error);
      stop();
      onError("Scanner unavailable – unable to load barcode library.");
    }
  }, [onError, onResult, startNativeDetector, stop]);

  React.useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return (
    <div className="space-y-3">
      <video
        ref={videoRef}
        playsInline
        muted
        className="w-full rounded-lg border bg-black/80"
        style={{ minHeight: 200 }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={start}
          disabled={running}
          className="flex-1"
        >
          Start
        </Button>
        <Button
          type="button"
          onClick={stop}
          disabled={!running}
          variant="secondary"
          className="flex-1"
        >
          Stop
        </Button>
      </div>
    </div>
  );
}
