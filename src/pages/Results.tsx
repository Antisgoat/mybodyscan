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
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
type ScanData = {
  id: string;
  status: string;
  bodyFatPercentage?: number;
  body_fat?: number;
  bodyfat?: number;
  weight?: number;
  weight_lbs?: number;
  bmi?: number;
  mediaUrl?: string;
  createdAt?: any;
  completedAt?: any;
  note?: string;
  [key: string]: any;
};

// Helper function to normalize field names
const normalizeFields = (scan: ScanData) => {
  const bodyFat = scan.bodyFatPercentage ?? scan.body_fat ?? scan.bodyfat ?? null;
  const weightLbs = scan.weight ?? scan.weight_lbs ?? null;
  const bmi = scan.bmi ?? null;
  
  return { bodyFat, weightLbs, bmi };
};

// Helper function to format dates
const formatDate = (timestamp: any) => {
  if (!timestamp) return "—";
  if (timestamp.toDate) return timestamp.toDate().toLocaleString();
  if (timestamp instanceof Date) return timestamp.toLocaleString();
  return "—";
};

// Processing UI component
const ProcessingUI = () => {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  
  const messages = [
    "Lining up your measurements…",
    "Estimating body fat with AI…", 
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

  // Initialize note from scan data
  useEffect(() => {
    if (scan?.note) {
      setNote(scan.note);
    }
  }, [scan?.note]);

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
  if (!user && !loading) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="Results – MyBodyScan" description="Review your body scan results and add notes." canonical={window.location.href} />
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
  if (loading) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="Results – MyBodyScan" description="Review your body scan results and add notes." canonical={window.location.href} />
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
  if (!scan) {
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

  const { bodyFat, weightLbs, bmi } = normalizeFields(scan);

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Results – MyBodyScan" description="Review your body scan results and add notes." canonical={window.location.href} />
      
      <h1 className="text-2xl font-semibold mb-6">Results</h1>

      {/* Status Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              {formatDate(scan.completedAt || scan.createdAt)}
            </CardTitle>
            <Badge variant={
              scan.status === "completed" ? "default" : 
              scan.status === "processing" ? "secondary" : 
              "destructive"
            }>
              {scan.status}
            </Badge>
          </div>
        </CardHeader>
        
        <CardContent>
          {scan.status === "processing" ? (
            <ProcessingUI />
          ) : scan.status === "failed" ? (
            <div className="text-center py-6">
              <p className="text-destructive mb-4">Scan analysis failed</p>
              <p className="text-sm text-muted-foreground mb-4">
                {scan.error || "We couldn't process your scan. Please try again with better lighting or clearer angles."}
              </p>
              <Button onClick={() => navigate("/scan/new")} variant="outline">
                Try Again
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 text-center">
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-3xl font-semibold text-primary">
                    {bodyFat ? `${bodyFat}%` : "—"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Body Fat %</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-3xl font-semibold text-primary">
                    {weightLbs ? `${weightLbs} lbs` : "—"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">Weight (lbs)</p>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-4 pb-4">
                  <p className="text-3xl font-semibold text-primary">
                    {bmi ? bmi : "—"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">BMI</p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes section - only show for completed scans */}
      {scan.status === "completed" && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Textarea
                placeholder="Add a note about this scan..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="min-h-[80px]"
              />
              <Button 
                onClick={onSaveNote}
                disabled={!note.trim() || saving}
                variant="secondary"
                className="w-full"
              >
                {saving ? "Saving..." : "Save Note"}
              </Button>
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
