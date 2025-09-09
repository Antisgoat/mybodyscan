import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Camera } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { consumeOneCredit } from "@/lib/payments";
import { startScan, uploadScanPhotos, submitScan } from "@/lib/scan";
import { track } from "@/lib/analytics";

const checklist = [
  "Good lighting - natural light works best",
  "Full body visible from head to toe",
  "Plain background - avoid patterns",
  "Form-fitting clothes or minimal clothing",
  "Stand straight with arms slightly away from body",
  "Remove shoes and accessories"
];

export default function Scan() {
  const [isScanning, setIsScanning] = useState(false);
  const navigate = useNavigate();

  const handleStartScan = async () => {
    setIsScanning(true);
    try {
      track("start_scan");
      await consumeOneCredit();
      const scan = await startScan();
      // TODO: capture up to 4 images from user
      const files: File[] = [];
      const paths = await uploadScanPhotos(scan, files);
      await submitScan(scan.scanId, paths);
      toast({ title: "Scan submitted" });
      navigate("/history");
    } catch (err: any) {
      if (err?.message === "No credits available") {
        toast({ title: "No scan credits", description: "Get more credits to run scans." });
        navigate("/plans");
      } else {
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
      <Seo title="Body Scan - MyBodyScan" description="Take a new body composition scan" />
      <AppHeader />
      <main className="max-w-md mx-auto p-6 space-y-6">
        <div className="text-center space-y-2">
          <Camera className="w-12 h-12 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">New Body Scan</h1>
          <p className="text-sm text-muted-foreground">
            Follow the checklist below for the most accurate results
          </p>
        </div>

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
            disabled={isScanning}
            className="w-full h-12 text-base"
          >
            {isScanning ? "Processing..." : "Start Scan"}
          </Button>
          
          <p className="text-xs text-center text-muted-foreground">
            By starting a scan, you agree to our{" "}
            <a href="/legal/terms" className="underline hover:text-primary">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="/legal/privacy" className="underline hover:text-primary">
              Privacy Policy
            </a>
          </p>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}