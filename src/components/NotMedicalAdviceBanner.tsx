import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function NotMedicalAdviceBanner() {
  const { t } = useI18n();

  return (
    <Alert className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="text-xs">
        {t("legal.notMedicalAdvice")}
      </AlertDescription>
    </Alert>
  );
}
