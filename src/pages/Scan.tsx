import { useEffect, useMemo, useState } from "react";
import ScanCapture from "@/features/scan/ScanCapture"; // from Prompt #6
import { startScanSession, uploadScanBlobs, submitScan, scanDocRef, type Pose } from "@/lib/api/scan";
import { useAuthUser } from "@/lib/useAuthUser";
import { onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

type CaptureReady = Record<Pose, Blob>;

export default function ScanPage() {
  const { user, loading: authLoading } = useAuthUser();
  const nav = useNavigate();
  const [phase, setPhase] = useState<"capture" | "upload" | "processing" | "done" | "error">("capture");
  const [scanId, setScanId] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<Pose, number>>({ front: 0, back: 0, left: 0, right: 0 });

  useEffect(() => {
    if (!authLoading && !user) nav("/auth?next=/scan");
  }, [authLoading, user, nav]);

  async function handleReady(payload: CaptureReady) {
    setErrMsg(null);
    try {
      setPhase("upload");
      const { scanId, uploadUrls } = await startScanSession();
      setScanId(scanId);

      await uploadScanBlobs({
        scanId,
        uploadUrls,
        blobs: payload,
        onProgress: ({ pose, percent }) =>
          setProgress((p) => ({ ...p, [pose]: Math.max(0, Math.min(100, Math.round(percent))) })),
      });

      setPhase("processing");
      await submitScan(scanId);

      // Live status via Firestore
      const unsub = onSnapshot(scanDocRef(scanId), (snap) => {
        const data = snap.data() as any;
        const status = (data?.status || "").toLowerCase();
        if (status === "completed" || data?.results) {
          unsub();
          setPhase("done");
        } else if (status === "error") {
          unsub();
          setErrMsg(data?.error || "Scan failed");
          setPhase("error");
        }
      });
    } catch (err: any) {
      setErrMsg(err?.message || "Something went wrong");
      setPhase("error");
    }
  }

  const overall = useMemo(() => {
    const vals = Object.values(progress);
    const sum = vals.reduce((a, b) => a + (b || 0), 0);
    return Math.round(sum / 4);
  }, [progress]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-lg font-semibold">Scan</h1>

      {phase === "capture" && <ScanCapture onReady={handleReady} />}

      {phase === "upload" && (
        <div className="space-y-3">
          <p className="text-sm">Uploading your photos…</p>
          <ul className="text-xs grid grid-cols-2 gap-2">
            {(["front","back","left","right"] as Pose[]).map((pose) => (
              <li key={pose} className="rounded border p-2">
                <div className="flex items-center justify-between">
                  <span className="capitalize">{pose}</span>
                  <span>{progress[pose]}%</span>
                </div>
                <div className="mt-1 h-1 w-full bg-black/10">
                  <div className="h-1" style={{ width: `${progress[pose]}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="text-xs text-muted-foreground">Overall: {overall}%</div>
        </div>
      )}

      {phase === "processing" && (
        <div className="space-y-2">
          <p className="text-sm">Processing your scan… this may take up to a minute on mobile networks.</p>
          <div className="animate-pulse h-2 w-1/2 bg-black/10" />
        </div>
      )}

      {phase === "done" && (
        <div className="space-y-2">
          <p className="text-sm">Scan complete.</p>
          <button
            className="rounded-md border px-3 py-2 text-sm"
            onClick={() => nav(`/scans/${scanId}`)}
          >
            View Results
          </button>
        </div>
      )}

      {phase === "error" && (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-red-700">Could not complete your scan.</p>
          {errMsg ? <p className="text-xs text-red-700/90">{errMsg}</p> : null}
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
