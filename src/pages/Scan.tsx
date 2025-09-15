import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { CheckCircle2, Camera, Upload, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { consumeOneCredit } from "@/lib/payments";
import { startScan, uploadScanPhotos, submitScan } from "@/lib/scan";
import { isDemoGuest } from "@/lib/demoFlag";
import { track } from "@/lib/analytics";
import { log } from "@/lib/logger";
import { useI18n } from "@/lib/i18n";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";

const checklist = [
  "Good lighting - natural light works best",
  "Full body visible from head to toe",
  "Plain background - avoid patterns",
  "Form-fitting clothes or minimal clothing",
  "Stand straight with arms slightly away from body",
  "Remove shoes and accessories"
];

export default function Scan() {
  const [files, setFiles] = useState<File[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const navigate = useNavigate();
  const { t } = useI18n();

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    
    // Validate file types
    const invalidFiles = selectedFiles.filter(file => !file.type.startsWith('image/'));
    if (invalidFiles.length > 0) {
      toast({ 
        title: "Invalid files", 
        description: "Only image files are allowed",
        variant: "destructive"
      });
      return;
    }

    setFiles(selectedFiles.slice(0, 4)); // Limit to 4 files
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const canSubmit = files.length === 4;

  const handleStartScan = async () => {
    if (isDemoGuest()) {
      toast({ title: t('auth.create_account') });
      navigate("/auth");
      return;
    }

    if (!canSubmit) {
      toast({ 
        title: "Missing photos", 
        description: "Please upload exactly 4 photos (front, left, right, back)",
        variant: "destructive"
      });
      return;
    }

    setIsScanning(true);
    try {
      await consumeOneCredit();
      const scan = await startScan();
      const paths = await uploadScanPhotos(scan, files);
      await submitScan(scan.scanId, paths as string[]);
      track("scan_submit");
      log("info", "scan_submit", { scanId: scan.scanId });
      toast({ title: "Scan submitted successfully" });
      navigate(`/processing/${scan.scanId}`);
    } catch (err: any) {
      if (err?.message === "No credits available") {
        toast({ title: "No scan credits", description: "Get more credits to run scans." });
        navigate("/plans");
      } else if (err?.message !== "demo-blocked") {
        toast({
          title: "Scan failed",
          description: err?.message || "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title={t('scan.title')} description="Take a new body composition scan" />
      <AppHeader />
      <NotMedicalAdviceBanner />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center space-y-2">
          <Camera className="w-12 h-12 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">{t('scan.newScan')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('scan.photosRequired')}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-accent" />
              {t('scan.takePhotos')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              type="file"
              multiple
              accept="image/*"
              onChange={handleFileUpload}
              className="cursor-pointer"
            />
            
            {files.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {files.map((file, index) => (
                  <div key={index} className="relative">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-24 object-cover rounded border"
                    />
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 text-center">
                      {['Front', 'Left', 'Right', 'Back'][index] || `Photo ${index + 1}`}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!canSubmit && files.length > 0 && (
              <p className="text-sm text-muted-foreground text-center">
                {4 - files.length} more photos needed
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-accent" />
              Preparation Checklist
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {checklist.map((item, index) => (
                <li key={index} className="flex items-start gap-3 text-sm">
                  <div className="w-4 h-4 rounded-full border border-primary flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <Button
            onClick={handleStartScan}
            disabled={isScanning || !canSubmit}
            className="w-full h-12 text-base"
          >
            {isScanning ? "Processing..." : "Start Scan"}
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            By starting a scan, you agree to our{" "}
            <a href="/legal/terms" className="underline hover:text-primary">
              {t('legal.terms')}
            </a>{" "}
            and{" "}
            <a href="/legal/privacy" className="underline hover:text-primary">
              {t('legal.privacy')}
            </a>
          </p>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}