import { useEffect, useState } from "react";
import { listScansByUid, Scan } from "@/services/placeholders";
import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";

const History = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [scans, setScans] = useState<Scan[]>([]);

  useEffect(() => {
    if (!user) return;
    // Placeholder collection group query replacement
    listScansByUid(user.uid, 50).then(setScans);
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
            <Card key={s.id} className="cursor-pointer" onClick={() => navigate(`/results/${s.uid}/${s.id}`)}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{new Date(s.createdAt).toLocaleString()}</p>
                  {s.status === "done" ? (
                    <p className="text-sm text-muted-foreground">{s.results.bodyFatPct?.toFixed(1)}% • {s.results.weightKg?.toFixed(1)}kg</p>
                  ) : (
                    <span className="text-sm text-muted-foreground">{s.status}</span>
                  )}
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
