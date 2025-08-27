import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot, collection, query, orderBy, limit, getDocs } from "firebase/firestore";

type ScanData = {
  id: string;
  status: string;
  results?: {
    bodyFat?: number;
    weight?: number;
    bmi?: number;
  };
  createdAt: any;
};

const ScanResult = () => {
  const { scanId } = useParams<{ scanId: string }>();
  const [scan, setScan] = useState<ScanData | null>(null);
  const [history, setHistory] = useState<ScanData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !scanId) return;

    // Listen to current scan
    const scanRef = doc(db, "users", user.uid, "scans", scanId);
    const unsubscribe = onSnapshot(scanRef, (doc) => {
      if (doc.exists()) {
        setScan({ id: doc.id, ...doc.data() } as ScanData);
      }
      setLoading(false);
    });

    // Load scan history
    const loadHistory = async () => {
      try {
        const historyQuery = query(
          collection(db, "users", user.uid, "scans"),
          orderBy("createdAt", "desc"),
          limit(10)
        );
        const snapshot = await getDocs(historyQuery);
        const historyData = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as ScanData))
          .filter(s => s.id !== scanId && s.results?.bodyFat);
        setHistory(historyData);
      } catch (error) {
        console.error("Error loading history:", error);
      }
    };

    loadHistory();
    return () => unsubscribe();
  }, [scanId]);

  if (loading) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-muted border-t-primary animate-spin" />
      </main>
    );
  }

  if (!scan) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <div className="text-center">
          <h1 className="text-xl font-semibold mb-2">Scan not found</h1>
          <p className="text-muted-foreground">This scan may have been deleted or doesn't exist.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo 
        title="Scan Results – MyBodyScan" 
        description="View your body scan analysis results and metrics." 
        canonical={window.location.href} 
      />

      <h1 className="text-2xl font-semibold mb-6">Scan Results</h1>

      <div className="space-y-6">
        {/* Current Scan Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Current Scan</CardTitle>
              <Badge variant={scan.status === "completed" ? "default" : "secondary"}>
                {scan.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {scan.status === "processing" ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full border-4 border-muted border-t-primary animate-spin mx-auto mb-4" />
                <p className="text-muted-foreground">Processing your scan...</p>
              </div>
            ) : scan.results ? (
              <div className="grid gap-4">
                {scan.results.bodyFat && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Body Fat</span>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-4 h-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Percentage of body weight that is fat tissue</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-xl font-semibold">{scan.results.bodyFat}%</span>
                  </div>
                )}
                
                {scan.results.weight && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Weight</span>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-4 h-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Total body weight measurement</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-xl font-semibold">{scan.results.weight} lbs</span>
                  </div>
                )}
                
                {scan.results.bmi && (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">BMI</span>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-4 h-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Body Mass Index: weight relative to height</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-xl font-semibold">{scan.results.bmi}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">No results available yet</p>
            )}
          </CardContent>
        </Card>

        {/* Scan History */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent History</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {history.map((historyScan) => (
                  <div key={historyScan.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                    <div className="text-sm">
                      {historyScan.createdAt?.seconds 
                        ? new Date(historyScan.createdAt.seconds * 1000).toLocaleDateString()
                        : "Recent"
                      }
                    </div>
                    <div className="text-sm font-medium">
                      {historyScan.results?.bodyFat}% BF
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
};

export default ScanResult;