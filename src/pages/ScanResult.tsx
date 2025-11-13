import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { onSnapshot, updateDoc } from "firebase/firestore";
import { scanDocRef, type ScanDoc, normalizeScanMetrics, statusOf } from "@/lib/scans";
import { useAuthUser } from "@/lib/useAuthUser";

export default function ScanResultPage() {
  const { scanId = "" } = useParams();
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuthUser();

  const [docState, setDocState] = useState<ScanDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) nav("/auth?next=" + encodeURIComponent(`/scans/${scanId}`));
  }, [authLoading, user, nav, scanId]);

  useEffect(() => {
    if (!scanId || !user) return;
    const ref = scanDocRef(scanId);
    const unsub = onSnapshot(ref, (snap) => {
      const d = (snap.exists() ? ({ id: snap.id, ...snap.data() } as ScanDoc) : null);
      setDocState(d);
      if (d && typeof d.notes === "string") setNotes(d.notes);
      setLoading(false);
    });
    return () => unsub();
  }, [scanId, user?.uid]);

  const metrics = useMemo(() => normalizeScanMetrics(docState), [docState]);
  const phase = useMemo(() => statusOf(docState), [docState]);

  async function saveNotes() {
    if (!scanId || !user) return;
    try {
      setSaving(true);
      await updateDoc(scanDocRef(scanId), { notes: notes.slice(0, 4000) }); // client can update notes only
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 1500);
    } catch (e: any) {
      setSaveMsg("Failed to save notes");
    } finally {
      setSaving(false);
    }
  }

  function shareResult() {
    const title = "MyBodyScan result";
    const text = metrics.bodyFatPct != null ? `Body fat: ${metrics.bodyFatPct}%` : "My latest scan";
    const url = window.location.href;
    if ((navigator as any).share) {
      (navigator as any).share({ title, text, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).then(() => setSaveMsg("Link copied"));
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4">
      <header className="sticky top-0 z-40 -mx-4 mb-3 bg-white/80 backdrop-blur border-b px-4 py-2 flex items-center gap-3">
        <button onClick={() => nav(-1)} className="rounded border px-2 py-1 text-xs">Back</button>
        <h1 className="text-sm font-medium truncate">Scan Result</h1>
        <div className="flex-1" />
        <button onClick={shareResult} className="rounded border px-2 py-1 text-xs">Share</button>
      </header>

      {loading && (
        <div className="space-y-4">
          <div className="h-6 w-40 bg-black/10 animate-pulse rounded" />
          <div className="grid grid-cols-3 gap-2">
            <div className="h-16 bg-black/10 animate-pulse rounded" />
            <div className="h-16 bg-black/10 animate-pulse rounded" />
            <div className="h-16 bg-black/10 animate-pulse rounded" />
          </div>
          <div className="h-24 bg-black/10 animate-pulse rounded" />
        </div>
      )}

      {!loading && !docState && (
        <div className="text-sm text-red-700">Scan not found.</div>
      )}

      {!loading && docState && (
        <div className="space-y-4">
          {/* Status / Phase */}
          {phase !== "completed" && phase !== "error" && (
            <div className="rounded border p-3">
              <p className="text-sm">
                {phase === "queued" && "Your scan is queued. This usually starts in a moment."}
                {phase === "processing" && "Processing your scan… this can take up to a minute on mobile networks."}
                {phase === "unknown" && "Preparing results…"}
              </p>
              <div className="mt-2 h-2 w-1/2 bg-black/10 animate-pulse" />
            </div>
          )}

          {phase === "error" && (
            <div className="rounded border p-3">
              <p className="text-sm text-red-700">We couldn’t complete this scan.</p>
              {docState.error && <p className="text-xs text-red-700/90 mt-1">{docState.error}</p>}
              <button onClick={() => nav("/scan")} className="mt-2 rounded border px-3 py-2 text-sm">Try again</button>
            </div>
          )}

          {/* Metrics */}
          {(phase === "completed" || metrics.bodyFatPct != null || metrics.weightLb != null || metrics.bmi != null) && (
            <section className="space-y-2">
              <h2 className="text-sm font-medium">Metrics</h2>
              <div className="grid grid-cols-3 gap-2">
                <MetricCard label="Body Fat" value={metrics.bodyFatPct != null ? `${metrics.bodyFatPct}%` : "—"} highlight />
                <MetricCard label="Weight" value={metrics.weightLb != null ? `${metrics.weightLb} lb` : "—"} />
                <MetricCard label="BMI" value={metrics.bmi != null ? `${metrics.bmi}` : "—"} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                MyBodyScan provides wellness information only and is <strong>not a medical device</strong>. Consult a clinician for medical advice.
              </p>
            </section>
          )}

          {/* Notes */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Notes</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="How did this scan feel? Any recent changes in training, sleep, or nutrition?"
              className="w-full rounded border p-2 text-sm"
              rows={4}
            />
            <div className="flex items-center gap-2">
              <button onClick={saveNotes} disabled={saving} className="rounded border px-3 py-2 text-sm">
                {saving ? "Saving…" : "Save Notes"}
              </button>
              {saveMsg && <span className="text-xs text-muted-foreground">{saveMsg}</span>}
            </div>
          </section>

          {/* Actions */}
          <section className="flex items-center gap-2">
            <button onClick={() => nav("/scan")} className="rounded border px-3 py-2 text-sm">Rescan</button>
            <button onClick={() => nav("/history")} className="rounded border px-3 py-2 text-sm">History</button>
            <button onClick={() => nav("/coach/tracker")} className="rounded border px-3 py-2 text-sm">Tracker</button>
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded border p-3 ${highlight ? "bg-emerald-50 border-emerald-200" : ""}`}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
