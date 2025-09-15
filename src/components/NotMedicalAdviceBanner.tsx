import { useTranslation } from "@/hooks/useTranslation";
import { AlertTriangle } from "lucide-react";

const NotMedicalAdviceBanner = () => {
  const { t } = useTranslation();
  
  return (
    <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
      <span className="text-yellow-800">{t("notmedicaladvice")}</span>
    </div>
  );
};

export default NotMedicalAdviceBanner;