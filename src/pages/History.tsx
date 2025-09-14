import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Seo } from "@/components/Seo";

type Scan = {
  id: string;
  createdAt?: any;
  status?: string;
  bodyFatPercentage?: number;
  body_fat?: number;
  bodyfat?: number;
  weight?: number;
  weight_lbs?: number;
  bmi?: number;
  results?: { bodyFatPct?: number; weightKg?: number; weightLb?: number; BMI?: number };
};

// Helper function to normalize field names
const normalizeFields = (scan: Scan) => {
  const bodyFat = scan.bodyFatPercentage ?? scan.body_fat ?? scan.bodyfat ?? scan.results?.bodyFatPct ?? null;
  const weightLbs = scan.weight ?? scan.weight_lbs ?? scan.results?.weightLb ?? null;
  const bmi = scan.bmi ?? scan.results?.BMI ?? null;
  
  return { bodyFat, weightLbs, bmi };
};

export default function History() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setScans([]);
      setErr(null);
      setLoading(true);

      if (!u) {
        setLoading(false);
        return;
      }

      try {
        const q = query(
          collection(db, "users", u.uid, "scans"),
          orderBy("createdAt", "desc"),
          limit(50)
        );
        const unsub = onSnapshot(
          q,
          (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Scan[];
            setScans(rows);
            setLoading(false);
          },
          (e) => {
            console.error("History listener error", e);
            setErr(e?.message ?? "Failed to load scans");
            setLoading(false);
            if ((e as any)?.code === "permission-denied") {
              toast({ title: "Sign in required" });
              navigate("/auth", { replace: true });
            }
          }
        );

        return () => unsub();
      } catch (e: any) {
        console.error("History query error", e);
        setErr(e?.message ?? "Failed to load scans");
        setLoading(false);
        if (e?.code === "permission-denied") {
          toast({ title: "Sign in required" });
          navigate("/auth", { replace: true });
        }
      }
    });
    return () => unsubAuth();
  }, [navigate]);

  if (!uid && !loading) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="History – MyBodyScan" description="View your scan history." canonical={window.location.href} />
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">History</h1>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground mb-4">Sign in required to view your history.</p>
              <Button onClick={() => navigate("/auth")} className="w-full">
                Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (err) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="History – MyBodyScan" description="View your scan history." canonical={window.location.href} />
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">History</h1>
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground mb-4">Unable to load your history. Please try again.</p>
              <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="History – MyBodyScan" description="View your scan history." canonical={window.location.href} />
        <h1 className="text-2xl font-semibold mb-6">History</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="animate-pulse">
                  <div className="h-4 bg-muted rounded w-24 mb-2"></div>
                  <div className="h-3 bg-muted rounded w-32"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    );
  }

  if (!scans.length) {
    return (
      <main className="min-h-screen p-6 max-w-md mx-auto">
        <Seo title="History – MyBodyScan" description="View your scan history." canonical={window.location.href} />
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">History</h1>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-medium">No scans yet</h3>
                  <p className="text-muted-foreground text-sm">Your first scan takes ~1–2 minutes.</p>
                </div>
                <Button onClick={() => navigate("/scan/new")} className="w-full">
                  Start Your First Scan
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="History – MyBodyScan" description="View your scan history." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-6">History</h1>
      
      <div className="space-y-4">
        {scans.map((scan) => {
          const { bodyFat, weightLbs, bmi } = normalizeFields(scan);
          const ts = scan.createdAt;
          const date = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
          const dateStr = date ? date.toLocaleDateString() : "—";
          
          return (
            <Card 
              key={scan.id} 
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/results`)}
            >
              <CardContent className="pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="font-medium">{dateStr}</div>
                  <Badge variant={
                    scan.status === "completed" ? "default" : 
                    scan.status === "processing" ? "secondary" : 
                    "destructive"
                  }>
                    {scan.status || "—"}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-center text-sm">
                  <div>
                    <p className="font-medium text-primary">
                      {bodyFat ? `${bodyFat}%` : "—"}
                    </p>
                    <p className="text-muted-foreground text-xs">Body Fat</p>
                  </div>
                  <div>
                    <p className="font-medium text-primary">
                      {weightLbs ? `${weightLbs} lbs` : "—"}
                    </p>
                    <p className="text-muted-foreground text-xs">Weight</p>
                  </div>
                  <div>
                    <p className="font-medium text-primary">
                      {bmi ? bmi : "—"}
                    </p>
                    <p className="text-muted-foreground text-xs">BMI</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
