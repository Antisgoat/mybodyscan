import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { collection, query, orderBy, limit as limitFn, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useAuthUser } from "@/lib/auth";

type LastScan = {
  id: string;
  createdAt: Date | null;
  results?: { bodyFatPct?: number; weightKg?: number; weightLb?: number; BMI?: number };
  status: string;
};

const Home = () => {
  const { user } = useAuthUser();
  const navigate = useNavigate();
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const loggedOnce = useRef(false);

  const done = lastScan?.status === "done";
  const created = lastScan?.createdAt ? lastScan.createdAt.toLocaleDateString() : "—";
  const bf = typeof lastScan?.results?.bodyFatPct === "number" ? lastScan.results!.bodyFatPct!.toFixed(1) : "—";
  const kg = typeof lastScan?.results?.weightKg === "number" ? lastScan.results!.weightKg! : null;
  const lb = typeof lastScan?.results?.weightLb === "number" ? lastScan.results!.weightLb! : null;
  const weight = kg != null ? `${kg} kg` : lb != null ? `${lb} lb` : "—";
  const bmi = typeof lastScan?.results?.BMI === "number" ? lastScan.results!.BMI!.toFixed(1) : "—";

  useEffect(() => {
    if (!user?.uid) return;
    const uid = user.uid;

    const q = query(
      collection(db, "users", uid, "scans"),
      orderBy("createdAt", "desc"),
      limitFn(1)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setLastScan(null);
          return;
        }
        const doc = snap.docs[0];
        const data: any = doc.data();
        const createdAt = data?.createdAt?.toDate ? data.createdAt.toDate() : null;
        if (!loggedOnce.current) {
          console.log("Home lastScan:", data);
          loggedOnce.current = true;
        }
        setLastScan({
          id: doc.id,
          createdAt,
          results: data?.results,
          status: data?.status ?? "unknown",
        });
      },
      (err) => {
        console.error("Home last scan error", err);
        if ((err as any)?.code === "permission-denied") {
          toast({ title: "Permission denied—please sign in again" });
          navigate("/auth", { replace: true });
        }
      }
    );

    return () => unsub();
  }, [user]);

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Home – MyBodyScan" description="Your latest body scan and quick actions." canonical={window.location.href} />
      <div className="mb-4 flex justify-center">
        <Card className="w-40">
          <CardContent className="p-4 text-center text-sm text-muted-foreground">MyBodyScan Logo</CardContent>
        </Card>
      </div>
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">MyBodyScan</h1>
      </header>
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Last scan</CardTitle>
            <CardDescription>The most recent result for your account</CardDescription>
          </CardHeader>
          <CardContent>
            {!lastScan && <p className="text-muted-foreground">No scans yet—tap Start a Scan.</p>}
            {lastScan && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{created}</p>
                {done ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-2xl font-semibold">{bf}</p>
                      <p className="text-xs text-muted-foreground">Body Fat</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{weight}</p>
                      <p className="text-xs text-muted-foreground">Weight</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{bmi}</p>
                      <p className="text-xs text-muted-foreground">BMI</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Badge variant="secondary">{lastScan.status}</Badge>
                    <p className="text-xs text-muted-foreground">Check History for progress.</p>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => navigate("/scan/new")}>Start a Scan</Button>
                  <Button variant="secondary" onClick={() => navigate("/history")}>View History</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-3">
          <Button onClick={() => navigate("/scan/new")}>Start a Scan</Button>
          <Button variant="secondary" onClick={() => navigate("/history")}>History</Button>
          <Button variant="outline" onClick={() => navigate("/plans")}>Plans</Button>
          <Button variant="outline" onClick={() => navigate("/settings")}>Settings</Button>
        </div>
      </section>
    </main>
  );
};

export default Home;
