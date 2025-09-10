import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { lookupUPC, FoodItem } from "@/lib/food";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (item: FoodItem | null) => void;
}

export function BarcodeScanner({ open, onOpenChange, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const reader = new BrowserMultiFormatReader();
    let active = true;
    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (res, err) => {
        if (!active) return;
        if (res) {
          active = false;
          lookupUPC(res.getText())
            .then((items) => onResult(items[0] || null))
            .catch(() => onResult(null))
            .finally(() => {
              onOpenChange(false);
              reader.reset();
            });
        }
      })
      .catch(() => setError("Camera permission denied"));
    return () => {
      active = false;
      reader.reset();
    };
  }, [open, onOpenChange, onResult]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col items-center">
        <DialogHeader>
          <DialogTitle>Scan Barcode</DialogTitle>
        </DialogHeader>
        {error ? <p className="text-sm text-muted-foreground">{error}</p> : <video ref={videoRef} className="w-full" />}
      </DialogContent>
    </Dialog>
  );
}
