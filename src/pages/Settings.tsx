import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { auth, db } from "@/firebaseConfig";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";
import { openStripePortal } from "@/lib/api";

const Settings = () => {
  const [height, setHeight] = useState<string>("");
  const [units, setUnits] = useState<"kg" | "lb">("kg");
  const [notify, setNotify] = useState(true);
  const [credits, setCredits] = useState<number>(0);
  const [planType, setPlanType] = useState<string | null>(null);
  const [planActive, setPlanActive] = useState<boolean>(false);
  const [renewal, setRenewal] = useState<string | null>(null);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    (async () => {
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data() as any;
        setCredits(d?.credits?.wallet ?? 0);
        setPlanType(d?.plan?.type ?? null);
        setPlanActive(Boolean(d?.plan?.active));
        setRenewal(d?.plan?.currentPeriodEnd ? new Date(d.plan.currentPeriodEnd.seconds ? d.plan.currentPeriodEnd.seconds * 1000 : d.plan.currentPeriodEnd).toLocaleDateString() : null);
      }
    })();
  }, []);

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo title="Settings – MyBodyScan" description="Manage your preferences and data." canonical={window.location.href} />
      <h1 className="text-2xl font-semibold mb-4">Settings</h1>

      {/* Billing */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            <div><span className="font-medium">Remaining credits:</span> {credits}</div>
            <div><span className="font-medium">Current plan:</span> {planType ? `${planType} ${planActive ? "(active)" : "(inactive)"}` : "None"}</div>
            {renewal && <div><span className="font-medium">Renews:</span> {renewal}</div>}
          </div>
          <div className="flex gap-2">
            <Button onClick={() => openStripePortal()}>Manage subscription</Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>Refresh</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="height">Height (cm)</Label>
            <Input id="height" type="number" inputMode="decimal" placeholder="e.g. 178" value={height} onChange={(e) => setHeight(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Units</Label>
            <div className="flex gap-2">
              <Button variant={units === "kg" ? "default" : "secondary"} onClick={() => setUnits("kg")}>kg</Button>
              <Button variant={units === "lb" ? "default" : "secondary"} onClick={() => setUnits("lb")}>lb</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notifications</Label>
            <div className="flex items-center gap-2">
              <input id="notify" type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
              <Label htmlFor="notify">Enable reminders</Label>
            </div>
          </div>
          <div className="grid gap-2">
            <Button onClick={() => toast({ title: "Preferences saved" })}>Save</Button>
            <Button variant="secondary" onClick={() => toast({ title: "Export requested", description: "We'll add this soon." })}>Export my data</Button>
            <Button variant="destructive" onClick={() => toast({ title: "Delete requested", description: "We'll add this soon." })}>Delete my data</Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default Settings;
