import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCcw } from "lucide-react";
import { Seo } from "@/components/Seo";
import { NotMedicalAdviceBanner } from "@/components/NotMedicalAdviceBanner";
import { auth, db } from "@/lib/firebase";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { extractScanMetrics } from "@/lib/scans";
import { summarizeScanMetrics, formatCentimetersAsInches } from "@/lib/scanDisplay";

interface ScanDocument {
  id: string;
  status: string;
  charged?: boolean;
  method?: "photo" | "photo+measure" | "bmi_fallback";
  confidence?: number;
  mode?: "2" | "4";
  qc?: string[];
  metrics?: {
    bf_percent?: number | null;
    bmi?: number | null;
    weight_kg?: number | null;
    weight_lb?: number | null;
    method?: string | null;
    confidence?: number | null;
  };
  analysis?: {
    neck_cm?: number | null;
    waist_cm?: number | null;
    hip_cm?: number | null;
  };
  result?: {
    bf_percent?: number | null;
    bmi?: number | null;
  };
  completedAt?: { seconds: number } | null;
  createdAt?: { seconds: number } | null;
}

const methodCopy: Record<string, string> = {
  photo: "Photo",
  "photo+measure": "Photo + Tape",
  bmi_fallback: "BMI Fallback",
};

const analysisFields = ["neck_cm", "waist_cm", "hip_cm"] as const;
const analysisLabels: Record<(typeof analysisFields)[number], string> = {
  neck_cm: "Neck",
  waist_cm: "Waist",
  hip_cm: "Hip",
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

export default function ScanResult() {
  const { scanId } = useParams<{ scanId: string }>();
  const [scan, setScan] = useState<ScanDocument | null>(null);
  const [history, setHistory] = useState<ScanDocument[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !scanId) return;

    const scanRef = doc(db, "users", user.uid, "scans", scanId);
    const unsub = onSnapshot(scanRef, (snapshot) => {
      if (snapshot.exists()) {
        setScan({ id: snapshot.id, ...(snapshot.data() as ScanDocument) });
      }
      setLoading(false);
    });

    const loadHistory = async () => {
      const list: ScanDocument[] = [];
      const histQuery = query(
        collection(db, "users", user.uid, "scans"),
        orderBy("completedAt", "desc"),
        limit(8)
      );
      const histSnap = await getDocs(histQuery);
      histSnap.forEach((docSnap) => {
        if (docSnap.id === scanId) return;
        const data = docSnap.data() as ScanDocument;
        const normalized = extractScanMetrics(data);
        if (data.charged && normalized.bodyFatPercent != null) {
          list.push({ id: docSnap.id, ...data });
        }
      });
      setHistory(list);
    };

    loadHistory().catch((error) => console.error("loadHistory", error));
    return () => unsub();
  }, [scanId]);

  const normalized = useMemo(() => (scan ? extractScanMetrics(scan) : null), [scan]);
  const summary = useMemo(() => summarizeScanMetrics(normalized), [normalized]);
  const confidenceChip = useMemo(
    () => confidenceLabel(normalized?.confidence ?? scan?.confidence),
    [normalized?.confidence, scan?.confidence]
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </main>
    );
  }

  if (!scan) {
    return (
      <main className="mx-auto max-w-xl p-6 text-center">
        <Seo title="Scan Result" />
        <p className="text-lg font-medium">Scan not found</p>
        <p className="text-sm text-muted-foreground">This scan may have been deleted.</p>
      </main>
    );
  }

  const bfPercent = summary.bodyFatPercent;
  const showResult = scan.charged && typeof bfPercent === "number";
  const bmiText = summary.bmiText;
  const weightText = summary.weightText;
  const methodKey = normalized?.method ?? scan.method;
  const methodBadge = methodKey ? methodCopy[methodKey] || methodKey : "Unknown";
  const hasWeight = summary.weightLb != null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-6 p-6">
      <Seo title="Scan Results – MyBodyScan" description="View your latest photo scan metrics." />
      <NotMedicalAdviceBanner />
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Scan Results</h1>
        <p className="text-sm text-muted-foreground">Completed on {formatDate(scan.completedAt?.seconds)}</p>
      </header>

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-3 text-2xl">
              Result
              <Badge variant="secondary">{methodBadge}</Badge>
              <Badge variant={confidenceChip.tone as any}>Confidence: {confidenceChip.label}</Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">Mode: {scan.mode === "4" ? "Precise (4 photos)" : "Quick (2 photos)"}</p>
          </div>
          <Link to="/scan/tips" className="text-sm text-primary underline">
            How to improve accuracy
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          {scan.status !== "completed" && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              <RefreshCcw className="h-4 w-4" />
              Processing — keep this tab open.
            </div>
          )}

          {showResult ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Body Fat</p>
                <p className="text-3xl font-bold">{bfPercent?.toFixed(1)}%</p>
                <p className="text-xs text-muted-foreground">Based on anthropometric estimation.</p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Weight</p>
                <p className="text-2xl font-semibold">{weightText}</p>
                <p className="text-xs text-muted-foreground">
                  {hasWeight ? "Latest reading from scan metrics." : "Add weight info to see this metric."}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">BMI</p>
                <p className="text-2xl font-semibold">{bmiText}</p>
                <p className="text-xs text-muted-foreground">Shown when weight is provided.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              No numeric results yet. Complete a photo scan that passes quality gates to view body-fat %.
            </div>
          )}

          {scan.analysis && (
            <div className="grid gap-3 md:grid-cols-3">
              {analysisFields.map((field) => {
                const value = scan.analysis?.[field];
                return (
                  <div key={field} className="rounded-lg bg-muted/50 p-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{analysisLabels[field]}</p>
                    <p className="text-sm font-medium">
                      {typeof value === "number" ? formatCentimetersAsInches(value) : "—"}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {scan.qc?.length ? (
            <div className="rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quality notes</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
                {scan.qc.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <details className="rounded-lg border p-3 text-sm text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground">Accuracy tips</summary>
            <p className="mt-2">
              Bright, even lighting and a neutral background improve confidence. Keep arms slightly away from your torso and
              stand on a marked spot about 8 ft from the camera.
            </p>
            <Link to="/scan/tips" className="mt-2 inline-flex text-xs font-medium text-primary underline">
              View full tips
            </Link>
          </details>
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Scans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {history.map((entry) => {
              const entryMetrics = extractScanMetrics(entry);
              const entrySummary = summarizeScanMetrics(entryMetrics);
              const conf = confidenceLabel(entryMetrics.confidence ?? entry.confidence);
              const method =
                methodCopy[(entryMetrics.method || entry.method || "") as string] ||
                entryMetrics.method ||
                entry.method ||
                "Photo";
              const bfValue = entrySummary.bodyFatPercent;
              const bmiValue = entrySummary.bmiText;
              const weightValue = entrySummary.weightText;
              return (
                <Link
                  key={entry.id}
                  to={`/results/${entry.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 transition hover:bg-muted"
                >
                  <div>
                    <p className="font-medium">{formatDate(entry.completedAt?.seconds)}</p>
                    <p className="text-xs text-muted-foreground">
                      {method + " • " + (entry.mode === "4" ? "Precise (4 photos)" : "Quick (2 photos)")}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{bfValue != null ? `${bfValue.toFixed(1)}%` : "—"}</p>
                      <p className="text-xs text-muted-foreground">{weightValue} • BMI {bmiValue}</p>
                    </div>
                    <Badge variant={conf.tone as any}>{conf.label}</Badge>
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Need better results?</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Use consistent lighting, mark a standing distance, and wear fitted clothing. If you have a tape measure, add those
            values during the scan for higher confidence.
          </p>
          <Link to="/scan/tips" className="mt-2 inline-block text-sm text-primary underline">
            Review photo tips
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
