// at top of History file
import { useEffect, useState } from "react";
import { onAuthStateChanged, getAuth } from "firebase/auth";
import { listenUserScans } from "../lib/scans"; // adjust if folder path differs

type Scan = {
  id: string;
  createdAt?: any;
  status?: string;
  results?: { bodyFatPct?: number; weightKg?: number; weightLb?: number; BMI?: number };
};

export default function History() {
  const auth = getAuth();
  const [uid, setUid] = useState<string | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setScans([]);
      setErr(null);

      if (!u) return;

      const unsub = listenUserScans(
        u.uid,
        (rows) => setScans(rows as Scan[]),
        (e) => setErr(e?.message ?? "Failed to load scans")
      );

      return () => unsub();
    });
    return () => unsubAuth();
  }, []);

  if (!uid) {
    return <div style={{ padding: 16 }}>Sign in required.</div>;
  }

  if (err) {
    return <div style={{ padding: 16 }}>Error: {err}</div>;
  }

  if (!scans.length) {
    return (
      <div style={{ padding: 16 }}>
        <h2>History</h2>
        <div style={{ opacity: 0.7 }}>No scans yet—tap Start a Scan.</div>
        <div style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>UID: {uid}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>History</h2>
      <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>UID: {uid}</div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {scans.map((s) => {
          const ts = (s as any)?.createdAt;
          const dt = ts?.toDate ? ts.toDate() : null;
          const dateStr = dt ? dt.toLocaleDateString() : "—";
          const bf = s.results?.bodyFatPct ?? "—";
          const kg = s.results?.weightKg;
          const lb = s.results?.weightLb;
          const weightStr = kg != null ? `${kg} kg` : lb != null ? `${lb} lb` : "—";
          return (
            <li
              key={s.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "12px 0",
                borderBottom: "1px solid #eee",
                cursor: "pointer"
              }}
              onClick={() => (window.location.href = `/results/${s.id}`)} // adjust route if needed
            >
              <div>
                <div style={{ fontWeight: 600 }}>{dateStr}</div>
                <div style={{ opacity: 0.8 }}>Body Fat: {bf}% • Weight: {weightStr}</div>
              </div>
              <div
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: "#f2f4f7"
                }}
              >
                {s.status ?? "—"}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
