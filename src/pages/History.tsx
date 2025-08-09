import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { collectionGroup, query, where, orderBy, limit as limitFn, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/firebaseConfig";

type FirestoreScan = {
  id: string;
  createdAt: Date;
  results?: { bodyFatPct?: number; weightKg?: number };
  status: string;
};

const History = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scans, setScans] = useState<FirestoreScan[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const uid = auth.currentUser.uid;

    const q = query(
      collectionGroup(db, "scans"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc"),
      limitFn(50)
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const items: FirestoreScan[] = snapshot.docs.map((doc) => {
        const data = doc.data() as any;
        const createdAt =
          data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now());
        return {
          id: doc.id,
          createdAt,
          results: data.results,
          status: data.status,
        };
      });
      setScans(items);
    });

    return () => unsub();
  }, [user]);

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="History – MyBodyScan" description="Browse your previous scans and open results." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-4">History</h1>
      {scans.length === 0 ? (
        <p className="text-muted-foreground">No scans yet—tap Start a Scan.</p>
      ) : (
        <div className="grid gap-3">
          {scans.map((s) => (
            <Card key={s.id} className="cursor-pointer" onClick={() => { const uid = auth.currentUser?.uid; if (uid) navigate(`/results/${uid}/${s.id}`); }}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{s.createdAt.toLocaleDateString()}</p>
                  <p className="text-sm text-muted-foreground">
                    {s.results?.bodyFatPct != null ? `${s.results.bodyFatPct.toFixed(1)}%` : "—"} • {s.results?.weightKg != null ? `${s.results.weightKg.toFixed(1)}kg` : "—"}
                  </p>
                  <span className="text-xs text-muted-foreground">{s.status}</span>
                </div>
                <Button variant="secondary" size="sm">Open</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
};

export default History;
