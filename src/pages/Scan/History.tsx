import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { auth, db } from "@/lib/firebase";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { extractScanMetrics } from "@/lib/scans";

interface StoredScan {
  id: string;
  createdAt?: unknown;
  bfPct?: number | null;
  bmi?: number | null;
  weightLb?: number | null;
  thumbnail?: string | null;
  method?: string | null;
  [key: string]: unknown;
}

function resolveDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === "function") {
      try {
        return maybe.toDate();
      } catch {
        // ignore
      }
    }
    if (typeof maybe.seconds === "number") {
      return new Date(maybe.seconds * 1000);
    }
  }
  if (typeof value === "number") {
    return new Date(value);
  }
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.valueOf())) {
      return parsed;
    }
  }
  return null;
}

function formatDate(value: unknown): string {
  const date = resolveDate(value);
  if (!date) return "Pending";
  try {
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return date.toISOString();
  }
}

function formatMethod(method?: string | null): string {
  if (!method) return "Photo";
  if (method === "photo") return "Photo";
  if (method === "photo+measure") return "Photo + Tape";
  if (method === "bmi_fallback") return "BMI Fallback";
  return method;
}

export default function ScanFlowHistory() {
  const [scans, setScans] = useState<StoredScan[]>([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setScans([]);
      return;
    }

    const scansRef = collection(db, "users", user.uid, "scans");
    const q = query(scansRef, orderBy("createdAt", "desc"), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const next: StoredScan[] = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      setScans(next);
    });

    return () => unsubscribe();
  }, []);

  const hasScans = scans.length > 0;

  return (
    <div className="space-y-6">
      <Seo title="Scan Flow History – MyBodyScan" description="Review past runs of the new scan flow." />
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Scan Flow History</h1>
        <p className="text-muted-foreground">
          Completed photo scans are saved automatically after analysis finishes.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent scans</CardTitle>
        </CardHeader>
        <CardContent>
          {hasScans ? (
            <ul className="space-y-3">
              {scans.map((scan) => {
                const metrics = extractScanMetrics(scan);
                const thumbnail = typeof scan.thumbnail === "string" ? scan.thumbnail : null;
                const methodLabel = formatMethod((scan.method as string | undefined) ?? (metrics.method ?? null));
                return (
                  <li key={scan.id} className="flex items-center gap-4 rounded-lg border p-4">
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-muted">
                      {thumbnail ? (
                        <img src={thumbnail} alt="Scan thumbnail" className="h-full w-full object-cover" />
                      ) : (
                        <span className="px-2 text-center text-xs text-muted-foreground">No preview</span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1">
                      <p className="font-medium leading-tight">{formatDate(scan.createdAt)}</p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{methodLabel}</p>
                      <p className="text-sm text-muted-foreground">
                        {metrics.weightLb != null ? `${metrics.weightLb.toFixed(1)} lb` : "Weight —"}
                        {metrics.bmi != null ? ` · BMI ${metrics.bmi.toFixed(1)}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Body Fat</p>
                      <p className="text-lg font-semibold">
                        {metrics.bodyFatPercent != null ? `${metrics.bodyFatPercent.toFixed(1)}%` : "—"}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Run a photo scan to see it listed here.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
