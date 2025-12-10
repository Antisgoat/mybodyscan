import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useLatestScanForUser } from "@/hooks/useLatestScanForUser";
import { updateDoc } from "@/lib/dbWrite";
import { doc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { extractScanMetrics } from "@/lib/scans";
import { summarizeScanMetrics } from "@/lib/scanDisplay";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { DemoBanner } from "@/components/DemoBanner";
import { isDemo } from "@/lib/demoFlag";
import { demoLatestScan } from "@/lib/demoDataset";
import { scanStatusLabel } from "@/lib/scanStatus";
// Helper function to format dates
const formatDate = (timestamp: any) => {
  if (!timestamp) return "—";
  if (timestamp.toDate) return timestamp.toDate().toLocaleString();
  if (timestamp instanceof Date) return timestamp.toLocaleString();
  if (typeof timestamp === "string") {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
  }
  return "—";
};

// Processing UI component
const ProcessingUI = () => {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  
  const messages = [
    "Lining up your measurements…",
    "Estimating body fat…",
    "Checking symmetry and posture…",
    "Crunching numbers…",
    "Almost there!"
  ];

  useEffect(() => {
    // Progress bar: 0→100% over 90s
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + (100 / 90), 100));
    }, 1000);

    // Message rotation: every 8s
    const messageInterval = setInterval(() => {
      setMessageIndex(prev => (prev + 1) % messages.length);
    }, 8000);

    return () => {
      clearInterval(progressInterval);
      clearInterval(messageInterval);
    };
  }, []);

  return (
    <div className="text-center py-8">
      <div className="max-w-xs mx-auto mb-6">
        <div className="w-full bg-muted rounded-full h-2 mb-3">
          <div 
            className="bg-primary h-2 rounded-full transition-all duration-1000 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm font-medium mb-2">{Math.round(progress)}%</p>
      </div>
      <p className="text-muted-foreground animate-fade-in">{messages[messageIndex]}</p>
      <p className="text-xs text-muted-foreground mt-2">This usually takes ~1–2 minutes.</p>
    </div>
  );
};

const Results = () => {
  const navigate = useNavigate();
  const { scan, loading, error, user } = useLatestScanForUser();
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const demo = isDemo();
  const readOnlyDemo = demo && !user;
  const activeScan = scan ?? (demo ? (demoLatestScan as any) : null);

  // Initialize note from scan data
  useEffect(() => {
    if (activeScan?.note) {
      setNote(activeScan.note);
    }
  }, [activeScan?.note]);

  const onSaveNote = async () => {
    if (!user || !scan || !note.trim()) return;
    
    setSaving(true);
    try {
      const scanRef = doc(db, "users", user.uid, "scans", scan.id);
      await updateDoc(scanRef, {
        note: note.trim(),
        noteUpdatedAt: serverTimestamp()
      });
      toast({ title: "Note saved successfully" });
    } catch (err: any) {
      console.error("Error saving note:", err);
      toast({ title: "Failed to save note", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Redirect to auth if not signed in
  if (!user && !demo && !loading) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="Results – MyBodyScan" description="Review your body scan results and add notes." canonical={window.location.href} />
        <DemoBanner />
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Results</h1>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground mb-4">Sign in required to view your results.</p>
              <Button onClick={() => navigate("/auth")} className="w-full">
                Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // Loading state
  if (loading && !demo) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="Results – MyBodyScan" description="Review your body scan results and add notes." canonical={window.location.href} />
        <DemoBanner />
        <h1 className="text-2xl font-semibold mb-6">Results</h1>
        
        <Card className="mb-6">
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <Skeleton className="h-12 w-16 mx-auto mb-2" />
                <Skeleton className="h-4 w-16 mx-auto" />
              </div>
              <div className="text-center">
                <Skeleton className="h-12 w-16 mx-auto mb-2" />
                <Skeleton className="h-4 w-16 mx-auto" />
              </div>
              <div className="text-center">
                <Skeleton className="h-12 w-16 mx-auto mb-2" />
                <Skeleton className="h-4 w-16 mx-auto" />
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }

  // Error state
  if (error) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="Results – MyBodyScan" description="Review your body scan results and add notes." canonical={window.location.href} />
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Results</h1>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground mb-4">Unable to load your results. Please try again.</p>
              <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  // No scans exist
  if (!activeScan) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="Results – MyBodyScan" description="Review your body scan results and add notes." canonical={window.location.href} />
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Results</h1>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-muted-foreground mb-4">No scans yet. Start your first body scan to see results here.</p>
              <Button onClick={() => navigate("/scan/new")} className="w-full">
                Start Your First Scan
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  const metrics = extractScanMetrics(activeScan);
  const summary = summarizeScanMetrics(metrics);
  const bodyFatText = summary.bodyFatPercent != null ? `${summary.bodyFatPercent.toFixed(1)}%` : "—";
  const weightDisplay = summary.weightText;
  const bmiDisplay = summary.bmiText;
  const statusMeta = scanStatusLabel(
    activeScan.status,
    activeScan.completedAt ?? activeScan.updatedAt ?? activeScan.createdAt,
  );

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Results – MyBodyScan" description="Review your body scan results and add notes." canonical={window.location.href} />
      <DemoBanner />

      <h1 className="text-2xl font-semibold mb-6">Results</h1>

      {/* Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {formatDate(activeScan.completedAt || activeScan.createdAt)}
            </CardTitle>
            <Badge variant={statusMeta.badgeVariant}>
              {statusMeta.label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          {!statusMeta.showMetrics ? (
            statusMeta.canonical === "error" || statusMeta.recommendRescan ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-destructive">{statusMeta.label}</p>
                <p className="text-sm text-muted-foreground">
                  {activeScan.error || activeScan.errorMessage || statusMeta.helperText || "We couldn't process your scan. Please try again."}
                </p>
                <Button onClick={() => navigate("/scan/new")} variant="outline">
                  Try Again
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <ProcessingUI />
                <p className="text-center text-xs text-muted-foreground">{statusMeta.helperText}</p>
              </div>
            )
          ) : (
            <div className="grid grid-cols-3 gap-4 text-center">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-3xl font-semibold text-primary">
                    {bodyFatText}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Body Fat %</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-3xl font-semibold text-primary">
                    {weightDisplay}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Weight</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-3xl font-semibold text-primary">
                    {bmiDisplay}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">BMI</p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes section - only show for completed scans */}
      {statusMeta.showMetrics && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Textarea
                placeholder={readOnlyDemo ? "Demo preview — notes are read-only." : "Add a note about this scan..."}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-[80px]"
                readOnly={readOnlyDemo}
                disabled={readOnlyDemo}
              />
              <DemoWriteButton
                onClick={onSaveNote}
                disabled={!note.trim() || saving || readOnlyDemo}
                title={readOnlyDemo ? "Demo preview — sign up to save notes" : undefined}
                variant="secondary"
                className="w-full"
              >
                {saving ? "Saving..." : readOnlyDemo ? "Sign up to save notes" : "Save Note"}
              </DemoWriteButton>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation buttons */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Button variant="secondary" onClick={() => navigate("/")}>
          Home
        </Button>
        <Button variant="secondary" onClick={() => navigate("/history")}>
          History
        </Button>
        <Button variant="outline" onClick={() => navigate("/scan/new")}>
          New Scan
        </Button>
      </div>
    </main>
  );
};

export default Results;
