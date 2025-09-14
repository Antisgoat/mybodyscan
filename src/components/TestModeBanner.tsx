import React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "lucide-react";
import { getAppConfig } from "@/lib/appConfig";

export default function TestModeBanner() {
  const [showBanner, setShowBanner] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    
    getAppConfig().then((config) => {
      if (alive && config?.allowFreeScans) {
        setShowBanner(true);
      }
    }).catch(() => {
      // Config not available, hide banner
    });
    
    return () => {
      alive = false;
    };
  }, []);

  if (!showBanner) return null;

  return (
    <Alert className="mb-4 border-orange-200 bg-orange-50">
      <Info className="h-4 w-4 text-orange-600" />
      <AlertDescription className="text-orange-800">
        <strong>Test mode active:</strong> Free scans are enabled. This banner appears only when test mode is configured.
      </AlertDescription>
    </Alert>
  );
}