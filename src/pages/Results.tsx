import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { doc, getDoc, collection, query, orderBy, startAfter, limit as limitFn, getDocs } from "firebase/firestore";
import { db, auth } from "@/firebaseConfig";
type ScanData = {
  id: string;
  status: string;
  results?: { bodyFatPct?: number; weightKg?: number; weightLb?: number; BMI?: number };
  createdAtDate: Date | null;
  createdAtTS: any | null;
};

type PrevData = {
  bodyFatPct?: number | null;
  weight?: { value: number; unit: "kg" | "lb" } | null;
} | null;

const Results = () => {
  const { scanId } = useParams();
  const uid = auth.currentUser?.uid ?? null;
  const navigate = useNavigate();
  const [scan, setScan] = useState<ScanData | null>(null);
  const [prev, setPrev] = useState<PrevData>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!uid || !scanId) return;
      try {
        const ref = doc(db, "users", uid, "scans", scanId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          setScan(null);
          return;
        }
        const data: any = snap.data();
        const createdAtTS = data?.createdAt ?? null;
        const createdAtDate = createdAtTS?.toDate ? createdAtTS.toDate() : null;
        const s: ScanData = {
          id: snap.id,
          status: data?.status ?? "unknown",
          results: data?.results,
          createdAtDate,
          createdAtTS,
        };
        setScan(s);

        // Load previous scan for deltas (next document after current in desc order)
        if (createdAtTS) {
          const q = query(
            collection(db, "users", uid, "scans"),
            orderBy("createdAt", "desc"),
            startAfter(createdAtTS),
            limitFn(1)
          );
          const prevSnap = await getDocs(q);
          if (!prevSnap.empty) {
            const pd = prevSnap.docs[0].data() as any;
            const kg = pd?.results?.weightKg ?? null;
            const lb = pd?.results?.weightLb ?? null;
            setPrev({
              bodyFatPct: pd?.results?.bodyFatPct ?? null,
              weight: kg != null ? { value: kg, unit: "kg" } : lb != null ? { value: lb, unit: "lb" } : null,
            });
          } else {
            setPrev(null);
          }
        }
      } catch (err: any) {
        console.error("Results load error", err);
        if (err?.code === "permission-denied") {
          toast({ title: "Sign in required" });
          navigate("/auth", { replace: true });
        }
      }
    };
    load();
  }, [uid, scanId]);

  const onSaveNote = async () => {
    toast({ title: "Note saved" });
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Results – MyBodyScan" description="Review your body scan results and add notes." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-4">Results</h1>
      {(!uid || !scanId) && (
        <div className="space-y-3">
          <p className="text-muted-foreground">Sign in required.</p>
          <Button variant="outline" onClick={() => navigate("/auth")}>Go to Sign In</Button>
        </div>
      )}
      {!scan && uid && scanId && (
        <div className="space-y-3">
          <p className="text-muted-foreground">Still processing…</p>
          <Button variant="outline" onClick={() => navigate("/history")}>Back to History</Button>
        </div>
      )}
      {scan && scan.status !== "done" && (
        <div className="space-y-3">
          <p className="text-muted-foreground">Still processing…</p>
          <Button variant="outline" onClick={() => navigate("/history")}>Back to History</Button>
        </div>
      )}
      {scan && scan.status === "done" && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{scan.createdAtDate ? scan.createdAtDate.toLocaleString() : "—"}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-3xl font-semibold">
                  {(() => {
                    const v = scan.results?.bodyFatPct;
                    if (v == null) return "—";
                    return v >= 10 ? v.toFixed(1) + "%" : v.toFixed(2) + "%";
                  })()}
                </p>
                <p className="text-xs text-muted-foreground">Body Fat</p>
              </div>
              <div>
                <p className="text-3xl font-semibold">
                  {scan.results?.weightKg != null
                    ? `${scan.results.weightKg.toFixed(1)} kg`
                    : scan.results?.weightLb != null
                      ? `${scan.results.weightLb.toFixed(1)} lb`
                      : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Weight</p>
              </div>
              <div>
                <p className="text-3xl font-semibold">
                  {scan.results?.BMI != null ? scan.results.BMI.toFixed(1) : "—"}
                </p>
                <p className="text-xs text-muted-foreground">BMI</p>
              </div>
            </div>
            {/* Delta line */}
            {prev && (
              <div className="mt-3 text-xs text-muted-foreground">
                {(() => {
                  const curBF = scan.results?.bodyFatPct ?? null;
                  const prevBF = prev?.bodyFatPct ?? null;
                  const arrowBF = curBF != null && prevBF != null ? (curBF - prevBF > 0 ? "↑" : curBF - prevBF < 0 ? "↓" : "→") : "";
                  const deltaBF = curBF != null && prevBF != null ? Math.abs(curBF - prevBF).toFixed(2) + "%" : "—";

                  const curW = scan.results?.weightKg != null
                    ? { value: scan.results.weightKg, unit: "kg" as const }
                    : scan.results?.weightLb != null
                      ? { value: scan.results.weightLb, unit: "lb" as const }
                      : null;
                  const prevW = prev?.weight ?? null;
                  const arrowW = curW && prevW ? (curW.value - prevW.value > 0 ? "↑" : curW.value - prevW.value < 0 ? "↓" : "→") : "";
                  const deltaW = curW && prevW && curW.unit === prevW.unit ? `${Math.abs(curW.value - prevW.value).toFixed(1)} ${curW.unit}` : "—";

                  return (
                    <p>
                      Δ Body Fat: {arrowBF} {deltaBF} • Δ Weight: {arrowW} {deltaW}
                    </p>
                  );
                })()}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {/* Notes and actions */}
      {scan && (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Input placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button variant="secondary" onClick={onSaveNote}>Save</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" onClick={() => navigate("/history")}>History</Button>
            <Button variant="outline" onClick={() => navigate("/capture")}>Start a Scan</Button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Results;
