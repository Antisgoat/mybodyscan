import { Alert, AlertDescription } from "@app/components/ui/alert.tsx";
import { AlertTriangle } from "lucide-react";
import { useI18n } from "@app/lib/i18n.ts";

export function NotMedicalAdviceBanner() {
  const { t } = useI18n();
  
  return (
    <Alert className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="text-xs">
        {t('legal.notMedicalAdvice')}
      </AlertDescription>
    </Alert>
  );
}