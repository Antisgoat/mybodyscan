// at top of History file
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

type Scan = {
  id: string;
  createdAt?: any;
  status?: string;
  results?: { bodyFatPct?: number; weightKg?: number; weightLb?: number; BMI?: number };
};

export default function History() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [scans, setScans] = useState<Scan[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUid(u?.uid ?? null);
      setScans([]);
      setErr(null);

      if (!u) return;

      try {
        const q = query(
          collection(db, "users", u.uid, "scans"),
          orderBy("createdAt", "desc"),
          limit(50)
        );
        const unsub = onSnapshot(
          q,
          (snap) => {
            const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Scan[];
            setScans(rows);
          },
          (e) => {
            console.error("History listener error", e);
            setErr(e?.message ?? "Failed to load scans");
            if ((e as any)?.code === "permission-denied") {
              toast({ title: "Sign in required" });
              navigate("/auth", { replace: true });
            }
          }
        );

        return () => unsub();
      } catch (e: any) {
        console.error("History query error", e);
        setErr(e?.message ?? "Failed to load scans");
        if (e?.code === "permission-denied") {
          toast({ title: "Sign in required" });
          navigate("/auth", { replace: true });
        }
      }
    });
    return () => unsubAuth();
  }, [navigate]);

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
        <div style={{ fontSize: 12, opacity: 0.5, marginTop: 8 }}>UID: {auth.currentUser?.uid ?? "no-auth"}</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16 }}>
      <h2>History</h2>
      <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 8 }}>UID: {auth.currentUser?.uid ?? "no-auth"}</div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {scans.map((s) => {
          const ts = (s as any)?.createdAt;
          const dt = ts?.toDate ? ts.toDate() : null;
          const dateStr = dt ? dt.toLocaleDateString() : "—";
          return (
            <li
              key={s.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 0",
                borderBottom: "1px solid #eee"
              }}
            >
              <div onClick={() => navigate(`/results/${s.id}`)} style={{ cursor: "pointer", flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{dateStr}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => navigate(`/report/${s.id}`)}
                >
                  Report
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
