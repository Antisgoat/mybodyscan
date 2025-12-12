import { useEffect, useState } from "react";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import type { ScanDocument } from "@/lib/api/scan";
import { auth, db } from "@/lib/firebase";
import { useAuthUser } from "@/lib/useAuthUser";
import { deserializeScanDocument } from "@/lib/api/scan";

export default function ScanHistoryPage() {
  const [scans, setScans] = useState<ScanDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuthUser();

  useEffect(() => {
    const currentUser = user ?? auth.currentUser;
    if (!currentUser) {
      setScans([]);
      return;
    }
    setError(null);
    const ref = collection(db, "users", currentUser.uid, "scans");
    const q = query(ref, orderBy("createdAt", "desc"), limit(10));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((docSnap) =>
          deserializeScanDocument(
            docSnap.id,
            currentUser.uid,
            docSnap.data() as Record<string, unknown>
          )
        );
        setScans(next);
      },
      (err) => {
        console.error("scan history snapshot error", err);
        setError("Unable to load scans right now.");
      }
    );
    return () => unsub();
  }, [user]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Recent scans</h1>
        <p className="text-sm text-muted-foreground">
          View your latest analyses.
        </p>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="space-y-3">
        {scans.map((scan) => (
          <div key={scan.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="font-semibold">
                  {scan.createdAt.toLocaleString()}
                </p>
                <p className="text-muted-foreground">Status: {scan.status}</p>
              </div>
              <a
                href={`/scan/${scan.id}`}
                className="text-sm font-medium underline"
              >
                View
              </a>
            </div>
            {scan.estimate && (
              <p className="mt-2 text-sm text-muted-foreground">
                Body fat:{" "}
                {typeof scan.estimate.bodyFatPercent === "number"
                  ? `${scan.estimate.bodyFatPercent.toFixed(1)}%`
                  : "—"}{" "}
                · BMI {scan.estimate.bmi ?? "—"}
              </p>
            )}
          </div>
        ))}
        {scans.length === 0 && (
          <p className="text-sm text-muted-foreground">No scans yet.</p>
        )}
      </div>
    </div>
  );
}
