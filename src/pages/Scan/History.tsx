import { useEffect, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import type { ScanDocument } from "@/lib/api/scan";

export default function ScanHistoryPage() {
  const [scans, setScans] = useState<ScanDocument[]>([]);

  useEffect(() => {
    const user = auth?.currentUser ?? null;
    if (!user) return;
    const ref = collection(db, "users", user.uid, "scans");
    const q = query(ref, orderBy("createdAt", "desc"), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs.map((doc) => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          uid: user.uid,
          createdAt: data.createdAt?.toDate?.() ?? new Date(),
          updatedAt: data.updatedAt?.toDate?.() ?? new Date(),
          status: data.status ?? "pending",
          errorMessage: data.errorMessage,
          photoPaths: data.photoPaths ?? { front: "", back: "", left: "", right: "" },
          input: data.input ?? { currentWeightKg: 0, goalWeightKg: 0 },
          estimate: data.estimate ?? null,
          workoutPlan: data.workoutPlan ?? null,
          nutritionPlan: data.nutritionPlan ?? null,
        } as ScanDocument;
      });
      setScans(next);
    });
    return () => unsub();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Recent scans</h1>
        <p className="text-sm text-muted-foreground">View your latest analyses.</p>
      </div>
      <div className="space-y-3">
        {scans.map((scan) => (
          <div key={scan.id} className="rounded-lg border p-4">
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="font-semibold">{scan.createdAt.toLocaleString()}</p>
                <p className="text-muted-foreground">Status: {scan.status}</p>
              </div>
              <a href={`/scan/${scan.id}`} className="text-sm font-medium underline">
                View
              </a>
            </div>
            {scan.estimate && (
              <p className="mt-2 text-sm text-muted-foreground">
                Body fat: {scan.estimate.bodyFatPercent.toFixed(1)}% · BMI {scan.estimate.bmi ?? "—"}
              </p>
            )}
          </div>
        ))}
        {scans.length === 0 && <p className="text-sm text-muted-foreground">No scans yet.</p>}
      </div>
    </div>
  );
}
