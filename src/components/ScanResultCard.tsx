import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { useI18n } from "@/lib/i18n";
import { formatWeightFromKg } from "@/lib/units";
import { useUnits } from "@/hooks/useUnits";

interface ScanResult {
  id: string;
  status: string;
  createdAt?: any;
  measurements?: {
    bodyFat?: number;
    body_fat?: number;
    weight?: number;
  };
  photos?: string[];
  note?: string;
}

interface ScanResultCardProps {
  scan: ScanResult;
  onEditNote?: (scanId: string) => void;
  showPhotos?: boolean;
}

export function ScanResultCard({
  scan,
  onEditNote,
  showPhotos,
}: ScanResultCardProps) {
  const { t } = useI18n();
  const { units } = useUnits();

  if (scan.status !== "ready" || !scan.measurements) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {scan.createdAt?.toDate
                ? scan.createdAt.toDate().toLocaleDateString()
                : ""}
            </CardTitle>
            <Badge variant={scan.status === "ready" ? "default" : "secondary"}>
              {scan.status}
            </Badge>
          </div>
        </CardHeader>
        {scan.status === "Processing" && (
          <CardContent>
            <div className="text-center py-4">
              <div className="animate-pulse text-sm text-muted-foreground">
                Your scan is being processed...
              </div>
            </div>
          </CardContent>
        )}
      </Card>
    );
  }

  const bodyFat = scan.measurements.bodyFat ?? scan.measurements.body_fat;
  const hasBodyFat = typeof bodyFat === "number" && Number.isFinite(bodyFat);
  const hasWeight =
    typeof scan.measurements.weight === "number" &&
    Number.isFinite(scan.measurements.weight);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {scan.createdAt?.toDate
              ? scan.createdAt.toDate().toLocaleDateString()
              : ""}
          </CardTitle>
          <Badge variant="default">Complete</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Main Metrics Grid */}
        <div className="grid grid-cols-1 gap-4 text-center sm:grid-cols-2">
          {hasBodyFat && (
            <div>
              <div className="text-2xl font-bold text-primary">{bodyFat}%</div>
              <div className="text-xs text-muted-foreground">
                Estimated {t("scan.bodyFat")} · photo estimate
              </div>
            </div>
          )}
          {hasWeight && (
            <div>
              <div className="text-2xl font-bold">
                {formatWeightFromKg(scan.measurements.weight, 0, units)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t("scan.weight")} · user input
              </div>
            </div>
          )}
        </div>

        {/* Photos Thumbnails */}
        {showPhotos && scan.photos && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Photos
            </div>
            <div className="grid grid-cols-4 gap-2">
              {scan.photos.slice(0, 4).map((photo, index) => (
                <div key={index} className="relative aspect-square">
                  <img
                    src={photo}
                    alt={`Scan photo ${index + 1}`}
                    className="w-full h-full object-cover rounded border cursor-pointer hover:opacity-80"
                    onClick={() => window.open(photo, "_blank")}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 text-center">
                    {["Front", "Left", "Right", "Back"][index]}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note */}
        {(scan.note || onEditNote) && (
          <div className="flex items-center justify-between text-xs">
            <div className="text-muted-foreground">
              {scan.note || "No note"}
            </div>
            {onEditNote && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onEditNote(scan.id)}
                className="h-6 px-2 text-xs"
              >
                Edit
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
