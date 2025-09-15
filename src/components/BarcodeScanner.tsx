import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera } from "lucide-react";
import { useI18n } from "@/lib/i18n";

interface BarcodeScannerProps {
  onBarcodeScanned: (barcode: string) => void;
}

export function BarcodeScanner({ onBarcodeScanned }: BarcodeScannerProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");

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
          <div className="bg-muted rounded-lg p-8 text-center">
            <Camera className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              Camera barcode scanning will be available in the mobile app
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="manual-barcode">Or enter barcode manually</Label>
            <Input
              id="manual-barcode"
              placeholder="Enter 8-14 digit barcode"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value.replace(/\D/g, ''))}
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