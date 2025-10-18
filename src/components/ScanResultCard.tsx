import { Card, CardContent, CardHeader, CardTitle } from "./ui/card.tsx";
import { Badge } from "./ui/badge.tsx";
import { Button } from "./ui/button.tsx";
import { useI18n } from "@app/lib/i18n.ts";
import { formatWeightFromKg } from "@app/lib/units.ts";

interface ScanResult {
  id: string;
  status: string;
  createdAt?: any;
  measurements?: {
    bodyFat?: number;
    body_fat?: number;
    weight?: number;
    bmi?: number;
    leanMass?: number;
    muscleMass?: number;
    bmr?: number;
    tee?: number;
    visceralFat?: number;
  };
  photos?: string[];
  note?: string;
}

interface ScanResultCardProps {
  scan: ScanResult;
  onEditNote?: (scanId: string) => void;
  showPhotos?: boolean;
}

export function ScanResultCard({ scan, onEditNote, showPhotos }: ScanResultCardProps) {
  const { t } = useI18n();

  if (scan.status !== "ready" || !scan.measurements) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              {scan.createdAt?.toDate ? scan.createdAt.toDate().toLocaleDateString() : ""}
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {scan.createdAt?.toDate ? scan.createdAt.toDate().toLocaleDateString() : ""}
          </CardTitle>
          <Badge variant="default">Complete</Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Main Metrics Grid */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-primary">
              {scan.measurements.bodyFat || scan.measurements.body_fat}%
            </div>
            <div className="text-xs text-muted-foreground">{t('scan.bodyFat')}</div>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {formatWeightFromKg(scan.measurements.weight)}
            </div>
            <div className="text-xs text-muted-foreground">{t('scan.weight')}</div>
          </div>
          <div>
            <div className="text-lg font-semibold">
              {scan.measurements.bmi}
            </div>
            <div className="text-xs text-muted-foreground">{t('scan.bmi')}</div>
          </div>
          <div>
            <div className="text-lg font-semibold">
              {formatWeightFromKg(scan.measurements.leanMass)}
            </div>
            <div className="text-xs text-muted-foreground">{t('scan.leanMass')}</div>
          </div>
        </div>

        {/* Additional Metrics */}
        <div className="grid grid-cols-2 gap-4 text-center text-sm">
          <div>
            <div className="font-medium">
              {formatWeightFromKg(scan.measurements.muscleMass)}
            </div>
            <div className="text-xs text-muted-foreground">{t('scan.muscleMass')}</div>
          </div>
          <div>
            <div className="font-medium">
              {scan.measurements.visceralFat}
            </div>
            <div className="text-xs text-muted-foreground">{t('scan.visceralFat')}</div>
          </div>
          <div>
            <div className="font-medium">
              {scan.measurements.bmr} kcal
            </div>
            <div className="text-xs text-muted-foreground">{t('scan.bmr')}</div>
          </div>
          <div>
            <div className="font-medium">
              {scan.measurements.tee} kcal
            </div>
            <div className="text-xs text-muted-foreground">{t('scan.tee')}</div>
          </div>
        </div>

        {/* Photos Thumbnails */}
        {showPhotos && scan.photos && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Photos</div>
            <div className="grid grid-cols-4 gap-2">
              {scan.photos.slice(0, 4).map((photo, index) => (
                <div key={index} className="relative aspect-square">
                  <img
                    src={photo}
                    alt={`Scan photo ${index + 1}`}
                    className="w-full h-full object-cover rounded border cursor-pointer hover:opacity-80"
                    onClick={() => window.open(photo, '_blank')}
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 text-center">
                    {['Front', 'Left', 'Right', 'Back'][index]}
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