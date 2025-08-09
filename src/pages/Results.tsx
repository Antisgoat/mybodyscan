import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { addNote, getScan, Scan } from "@/services/placeholders";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";

const Results = () => {
  const { uid, scanId } = useParams();
  const navigate = useNavigate();
  const [scan, setScan] = useState<Scan | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!uid || !scanId) return;
    getScan(uid, scanId).then((s) => {
      setScan(s);
      setNote(s?.notes || "");
    });
  }, [uid, scanId]);

  const onSaveNote = async () => {
    if (!uid || !scanId) return;
    await addNote(uid, scanId, note);
    toast({ title: "Note saved" });
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Results – MyBodyScan" description="Review your body scan results and add notes." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-4">Results</h1>
      {!scan && <p className="text-muted-foreground">Still processing…</p>}
      {scan && scan.status !== "done" && (
        <p className="text-muted-foreground">Still processing…</p>
      )}
      {scan && scan.status === "done" && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>{new Date(scan.createdAt).toLocaleString()}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-3xl font-semibold">{scan.results.bodyFatPct?.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Body Fat</p>
              </div>
              <div>
                <p className="text-3xl font-semibold">{scan.results.weightKg?.toFixed(1)}kg</p>
                <p className="text-xs text-muted-foreground">Weight</p>
              </div>
              <div>
                <p className="text-3xl font-semibold">{scan.results.BMI?.toFixed(1)}</p>
                <p className="text-xs text-muted-foreground">BMI</p>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              {scan.modelVersion && <span className="rounded-full bg-secondary px-2 py-1">Model {scan.modelVersion}</span>}
              {typeof scan.qualityScore === "number" && <span className="rounded-full bg-secondary px-2 py-1">Quality {scan.qualityScore.toFixed(2)}</span>}
            </div>
          </CardContent>
        </Card>
      )}
      {scan && (
        <div className="grid gap-3">
          <div className="flex items-center gap-2">
            <Input placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
            <Button variant="secondary" onClick={onSaveNote}>Save</Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button variant="secondary" onClick={() => navigate("/history?compare=1")}>Compare</Button>
            <Button variant="outline" onClick={() => navigate("/home")}>Back to Home</Button>
          </div>
        </div>
      )}
    </main>
  );
};

export default Results;
