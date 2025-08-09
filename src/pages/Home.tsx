import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/context/AuthContext";
import { getLastScan, Scan } from "@/services/placeholders";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";

const Home = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [lastScan, setLastScan] = useState<Scan | null>(null);

  useEffect(() => {
    if (!user) return;
    getLastScan(user.uid).then(setLastScan);
  }, [user]);

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Home – MyBodyScan" description="Your latest body scan and quick actions." canonical={window.location.href} />
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">MyBodyScan</h1>
      </header>
      <section className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Last scan</CardTitle>
            <CardDescription>The most recent result for your account</CardDescription>
          </CardHeader>
          <CardContent>
            {!lastScan && <p className="text-muted-foreground">No scans yet—tap Start a Scan.</p>}
            {lastScan && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{new Date(lastScan.createdAt).toLocaleString()}</p>
                {lastScan.status === "done" ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-2xl font-semibold">{lastScan.results.bodyFatPct?.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">Body Fat</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{lastScan.results.weightKg?.toFixed(1)}kg</p>
                      <p className="text-xs text-muted-foreground">Weight</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{lastScan.results.BMI?.toFixed(1)}</p>
                      <p className="text-xs text-muted-foreground">BMI</p>
                    </div>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 bg-secondary text-secondary-foreground">
                    <span className="h-2 w-2 rounded-full bg-warning" />
                    <span className="text-sm">{lastScan.status}</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-3">
          <Button onClick={() => navigate("/capture")}>Start a Scan</Button>
          <Button variant="secondary" onClick={() => navigate("/history")}>History</Button>
          <Button variant="outline" onClick={() => navigate("/plans")}>Plans</Button>
          <Button variant="outline" onClick={() => navigate("/settings")}>Settings</Button>
        </div>
      </section>
    </main>
  );
};

export default Home;
