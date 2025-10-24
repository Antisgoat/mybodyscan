import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BottomNav } from "@/components/BottomNav";
import { DemoBanner } from "@/components/DemoBanner";
import { Seo } from "@/components/Seo";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { auth, db } from "@/lib/firebase";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { extractScanMetrics } from "@/lib/scans";
import { summarizeScanMetrics } from "@/lib/scanDisplay";

interface ScanHistoryEntry {
  id: string;
  completedAt?: { seconds: number } | null;
  status?: string;
  charged?: boolean;
  method?: "photo" | "photo+measure" | "bmi_fallback";
  confidence?: number;
  mode?: "2" | "4";
  metrics?: {
    bf_percent?: number | null;
    bmi?: number | null;
    weight_kg?: number | null;
    weight_lb?: number | null;
    method?: string | null;
    confidence?: number | null;
  };
  result?: {
    bf_percent?: number | null;
    bmi?: number | null;
  };
}

const methodCopy: Record<string, string> = {
  photo: "Photo",
  "photo+measure": "Photo + Tape",
  bmi_fallback: "BMI Fallback",
};

function confidenceLabel(value?: number) {
  if (value == null) return { label: "Unknown", tone: "secondary" } as const;
  if (value >= 0.85) return { label: "High", tone: "default" } as const;
  if (value >= 0.7) return { label: "Medium", tone: "outline" } as const;
  return { label: "Low", tone: "secondary" } as const;
}

function formatDate(seconds?: number) {
  if (!seconds) return "—";
  try {
    return new Date(seconds * 1000).toLocaleDateString();
  } catch {
    return "—";
  }
}

function modeLabel(mode?: "2" | "4") {
  return mode === "4" ? "Precise (4 photos)" : "Quick (2 photos)";
}

export default function History() {
  const [entries, setEntries] = useState<ScanHistoryEntry[]>([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    const ref = collection(db, "users", user.uid, "scans");
    const q = query(ref, orderBy("completedAt", "desc"), limit(25));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: ScanHistoryEntry[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as ScanHistoryEntry;
        const metrics = extractScanMetrics(data);
        if (!data.charged || metrics.bodyFatPercent == null) return;
        list.push({ id: doc.id, ...data });
      });
      setEntries(list);
    });
    return () => unsub();
  }, []);

  const recent = useMemo(
    () =>
      entries.filter((entry) => {
        const metrics = extractScanMetrics(entry);
        return entry.charged && metrics.bodyFatPercent != null;
      }),
    [entries]
  );

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <Seo title="History – MyBodyScan" description="Review your photo scan history." />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
        <NotMedicalAdviceBanner />
        <DemoBanner />
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold">History</h1>
          <p className="text-sm text-muted-foreground">Track previous photo scans and revisit your body-fat estimates.</p>
        </header>

        {recent.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Complete a scan to see it listed here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {recent.map((entry) => {
              const metrics = extractScanMetrics(entry);
              const summary = summarizeScanMetrics(metrics);
              const confidence = confidenceLabel(metrics.confidence ?? entry.confidence);
              const method =
                methodCopy[(metrics.method || entry.method || "") as string] ||
                metrics.method ||
                entry.method ||
                "Photo";
              const bfPercent = summary.bodyFatPercent;
              const bmiText = summary.bmiText;
              const weightText = summary.weightText;
              return (
                <Link
                  key={entry.id}
                  to={`/results/${entry.id}`}
                  className="block rounded-lg border transition hover:border-primary"
                >
                  <Card>
                    <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <CardTitle className="text-lg">{formatDate(entry.completedAt?.seconds)}</CardTitle>
                        <p className="text-xs text-muted-foreground">{modeLabel(entry.mode)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>{method}</Badge>
                        <Badge variant={confidence.tone as any}>{confidence.label}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Body Fat</p>
                        <p className="text-lg font-semibold">{bfPercent != null ? `${bfPercent.toFixed(1)}%` : "—"}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Weight</p>
                        <p className="text-lg font-semibold">{weightText}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">BMI</p>
                        <p className="text-lg font-semibold">{bmiText}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
