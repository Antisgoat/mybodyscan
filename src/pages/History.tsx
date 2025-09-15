import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { History as HistoryIcon, TrendingUp, Edit, ArrowUp, ArrowDown } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { auth } from "@/lib/firebase";
import { watchScans } from "@/lib/scan";
import { isDemoGuest } from "@/lib/demoFlag";
import { toast } from "@/hooks/use-toast";

export default function History() {
  const [selectedScans, setSelectedScans] = useState<string[]>([]);
  const [scans, setScans] = useState<any[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [editingNote, setEditingNote] = useState<{scanId: string, note: string} | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsub = watchScans(uid, setScans);
    return unsub;
  }, []);

  const handleSelectScan = (scanId: string, checked: boolean) => {
    if (checked) {
      setSelectedScans(prev => [...prev, scanId]);
    } else {
      setSelectedScans(prev => prev.filter(id => id !== scanId));
    }
  };

  const canCompare = selectedScans.length === 2;
  
  const getSelectedScansData = () => {
    return selectedScans.map(id => scans.find(scan => scan.id === id)).filter(Boolean);
  };

  const calculateDelta = (value1?: number, value2?: number) => {
    if (!value1 || !value2) return null;
    const delta = value2 - value1;
    return {
      value: Math.abs(delta),
      isIncrease: delta > 0,
      percentage: ((delta / value1) * 100).toFixed(1)
    };
  };

  const saveNote = async (scanId: string, note: string) => {
    // In a real app, this would save to backend
    toast({ title: "Note saved" });
    setEditingNote(null);
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="History - MyBodyScan" description="Your body scan results and progress" />
        <AppHeader />
        <main className="max-w-md mx-auto p-6 space-y-6">
          <DemoBanner />
          <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HistoryIcon className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-semibold">{t('history.title')}</h1>
          </div>
          {scans.length > 1 && (
            <Button
              variant="outline"
              size="sm"
              disabled={!canCompare}
              onClick={() => setShowCompare(true)}
              className="flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4" />
              {t('history.compare')}
            </Button>
          )}
        </div>

        {scans.length > 0 ? (
          <div className="space-y-4">
            {scans.map((scan) => (
              <Card key={scan.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {scans.length > 1 && (
                        <Checkbox
                          checked={selectedScans.includes(scan.id)}
                          onCheckedChange={(checked) => handleSelectScan(scan.id, !!checked)}
                          disabled={!canCompare && selectedScans.length >= 2 && !selectedScans.includes(scan.id)}
                        />
                      )}
                      <CardTitle className="text-base">
                        {scan.createdAt?.toDate ? scan.createdAt.toDate().toLocaleDateString() : ""}
                      </CardTitle>
                    </div>
                    <Badge variant={scan.status === "ready" ? "default" : "secondary"}>
                      {scan.status}
                    </Badge>
                  </div>
                </CardHeader>
                {scan.status === "ready" && scan.measurements && (
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-center text-sm">
                      <div>
                        <div className="text-lg font-semibold">{scan.measurements.bodyFat || scan.measurements.body_fat}%</div>
                        <div className="text-xs text-muted-foreground">{t('scan.bodyFat')}</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold">{scan.measurements.weight || scan.weight}kg</div>
                        <div className="text-xs text-muted-foreground">{t('scan.weight')}</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold">{scan.measurements.bmi || scan.bmi}</div>
                        <div className="text-xs text-muted-foreground">{t('scan.bmi')}</div>
                      </div>
                      <div>
                        <div className="text-lg font-semibold">{scan.muscleMass || scan.measurements.muscleMass}kg</div>
                        <div className="text-xs text-muted-foreground">{t('scan.muscleMass')}</div>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        {scan.note && (
                          <div className="flex items-center gap-1">
                            <Edit className="w-3 h-3" />
                            <span>{scan.note}</span>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditingNote({scanId: scan.id, note: scan.note || ''})}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                )}
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
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <HistoryIcon className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">{t('history.noScans')}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Take your first scan to start tracking your progress
              </p>
              <Button onClick={() => window.location.href = '/scan'}>
                Start Your First Scan
              </Button>
            </CardContent>
          </Card>
        )}
      </main>
      <BottomNav />

      {/* Compare Dialog */}
      <Dialog open={showCompare} onOpenChange={setShowCompare}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Compare Scans</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-6">
            {getSelectedScansData().map((scan, index) => (
              <div key={scan.id} className="space-y-4">
                <h3 className="font-semibold">
                  Scan {index + 1} - {scan.createdAt?.toDate?.().toLocaleDateString()}
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{t('scan.bodyFat')}:</span>
                    <span>{scan.measurements?.bodyFat || scan.measurements?.body_fat}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('scan.weight')}:</span>
                    <span>{scan.measurements?.weight || scan.weight}kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('scan.bmi')}:</span>
                    <span>{scan.measurements?.bmi || scan.bmi}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{t('scan.muscleMass')}:</span>
                    <span>{scan.muscleMass || scan.measurements?.muscleMass}kg</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {getSelectedScansData().length === 2 && (
            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">Changes</h4>
              <div className="space-y-2 text-sm">
                {(() => {
                  const [scan1, scan2] = getSelectedScansData();
                  const bodyFatDelta = calculateDelta(
                    scan1.measurements?.bodyFat || scan1.measurements?.body_fat,
                    scan2.measurements?.bodyFat || scan2.measurements?.body_fat
                  );
                  const weightDelta = calculateDelta(
                    scan1.measurements?.weight || scan1.weight,
                    scan2.measurements?.weight || scan2.weight
                  );
                  
                  return (
                    <>
                      {bodyFatDelta && (
                        <div className="flex items-center gap-2">
                          {bodyFatDelta.isIncrease ? (
                            <ArrowUp className="w-4 h-4 text-red-500" />
                          ) : (
                            <ArrowDown className="w-4 h-4 text-green-500" />
                          )}
                          <span>Body Fat: {bodyFatDelta.isIncrease ? '+' : '-'}{bodyFatDelta.value.toFixed(1)}%</span>
                        </div>
                      )}
                      {weightDelta && (
                        <div className="flex items-center gap-2">
                          {weightDelta.isIncrease ? (
                            <ArrowUp className="w-4 h-4 text-blue-500" />
                          ) : (
                            <ArrowDown className="w-4 h-4 text-blue-500" />
                          )}
                          <span>Weight: {weightDelta.isIncrease ? '+' : '-'}{weightDelta.value.toFixed(1)}kg</span>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Note Dialog */}
      <Dialog open={!!editingNote} onOpenChange={() => setEditingNote(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Label>Scan Note</Label>
            <Input
              value={editingNote?.note || ''}
              onChange={(e) => setEditingNote(prev => prev ? {...prev, note: e.target.value} : null)}
              placeholder="Add a note about this scan..."
            />
            <Button 
              onClick={() => editingNote && saveNote(editingNote.scanId, editingNote.note)}
              className="w-full"
            >
              Save Note
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}