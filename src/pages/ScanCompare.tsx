/**
 * Pipeline map — Scan history consumption:
 * - Subscribes to two Firestore scan docs so users can compare normalized metrics post-analysis.
 * - Uses `normalizeScanMetrics` to convert canonical kg/cm data into lb/BMI for the UI.
 * - Provides share/back/rescan affordances so users can quickly start another scan if deltas look off.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { onSnapshot } from "firebase/firestore";
import { scanDocRef, type ScanDoc, normalizeScanMetrics } from "@/lib/scans";
import { lbToKg } from "@/lib/units";
import { useUnits } from "@/hooks/useUnits";

export default function ScanComparePage() {
  const nav = useNavigate();
  const { leftId = "", rightId = "" } = useParams();
  const [left, setLeft] = useState<ScanDoc | null>(null);
  const [right, setRight] = useState<ScanDoc | null>(null);
  const { units } = useUnits();

  useEffect(() => {
    if (!leftId) return undefined;
    return onSnapshot(scanDocRef(leftId), (s) =>
      setLeft(s.exists() ? ({ id: s.id, ...s.data() } as any) : null)
    );
  }, [leftId]);
  useEffect(() => {
    if (!rightId) return undefined;
    return onSnapshot(scanDocRef(rightId), (s) =>
      setRight(s.exists() ? ({ id: s.id, ...s.data() } as any) : null)
    );
  }, [rightId]);

  const L = useMemo(() => normalizeScanMetrics(left || undefined), [left]);
  const R = useMemo(() => normalizeScanMetrics(right || undefined), [right]);
  const weightUnitLabel = units === "metric" ? "kg" : "lb";
  const convertWeight = (value: number | null) => {
    if (value == null) return null;
    const numeric = units === "metric" ? lbToKg(value) : value;
    return Number.isFinite(numeric) ? Number(numeric.toFixed(1)) : null;
  };
  const leftWeight = convertWeight(L.weightLb);
  const rightWeight = convertWeight(R.weightLb);

  function delta(a: number | null, b: number | null) {
    if (a == null || b == null) return { abs: null, pct: null };
    const abs = Math.round((b - a) * 10) / 10;
    const pct = a !== 0 ? Math.round(((b - a) / a) * 1000) / 10 : null;
    return { abs, pct };
  }
  const dBF = delta(L.bodyFatPct, R.bodyFatPct);
  const dW = delta(leftWeight, rightWeight);
  const dBMI = delta(L.bmi, R.bmi);

  function label(d: { abs: number | null; pct: number | null }, unit = "") {
    if (d.abs == null) return "—";
    const sign = d.abs > 0 ? "+" : "";
    const pct = d.pct == null ? "" : ` (${d.pct > 0 ? "+" : ""}${d.pct}%)`;
    return `${sign}${d.abs}${unit}${pct}`;
  }

  function share() {
    const url = window.location.href;
    const text = `MyBodyScan compare — BF ${L.bodyFatPct ?? "—"}% → ${R.bodyFatPct ?? "—"}%`;
    if ((navigator as any).share) {
      void (navigator as any).share({ title: "MyBodyScan", text, url });
      return;
    }
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(url);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-4 space-y-4">
      <header className="sticky top-0 z-40 -mx-4 mb-1 bg-white/80 backdrop-blur border-b px-4 py-2 flex items-center gap-3">
        <button
          onClick={() => nav(-1)}
          className="rounded border px-2 py-1 text-xs"
        >
          Back
        </button>
        <h1 className="text-sm font-medium">Compare Scans</h1>
        <div className="flex-1" />
        <button onClick={share} className="rounded border px-2 py-1 text-xs">
          Share
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <CompareCol
          title="Left"
          id={leftId}
          BF={L.bodyFatPct}
          W={leftWeight}
          BMI={L.bmi}
          unitLabel={weightUnitLabel}
        />
        <CompareCol
          title="Right"
          id={rightId}
          BF={R.bodyFatPct}
          W={rightWeight}
          BMI={R.bmi}
          unitLabel={weightUnitLabel}
        />
      </div>

      <section className="rounded border p-3">
        <h2 className="text-sm font-medium mb-2">Change (Left → Right)</h2>
        <ul className="text-sm space-y-1">
          <li>
            Body Fat: <strong>{label(dBF, "%")}</strong>
          </li>
          <li>
            Weight: <strong>{label(dW, ` ${weightUnitLabel}`)}</strong>
          </li>
          <li>
            BMI: <strong>{label(dBMI)}</strong>
          </li>
        </ul>
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => nav(`/scans/compare/${rightId}/${leftId}`)}
            className="rounded border px-3 py-2 text-sm"
          >
            Swap Sides
          </button>
          <button
            onClick={() => nav("/scan")}
            className="rounded border px-3 py-2 text-sm"
          >
            Rescan
          </button>
        </div>
      </section>
    </div>
  );
}

function CompareCol({
  title,
  id,
  BF,
  W,
  BMI,
  unitLabel,
}: {
  title: string;
  id: string;
  BF: number | null;
  W: number | null;
  BMI: number | null;
  unitLabel: string;
}) {
  return (
    <div className="rounded border p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="text-[11px] text-muted-foreground truncate">#{id}</div>
      <div className="mt-2 space-y-1 text-sm">
        <div>
          BF: <strong>{BF != null ? `${BF}%` : "—"}</strong>
        </div>
        <div>
          Weight: <strong>{W != null ? `${W} ${unitLabel}` : "—"}</strong>
        </div>
        <div>
          BMI: <strong>{BMI != null ? `${BMI}` : "—"}</strong>
        </div>
      </div>
    </div>
  );
}
