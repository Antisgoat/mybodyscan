import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp, collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { useCredits } from "@/hooks/useCredits";
import { openStripePortal } from "@/lib/api";
import { useNavigate } from "react-router-dom";

const Settings = () => {
  const [height, setHeight] = useState<string>("");
  const [notify, setNotify] = useState(true);
  const { credits } = useCredits();
  const [planType, setPlanType] = useState<string | null>(null);
  const [planActive, setPlanActive] = useState<boolean>(false);
  const [renewal, setRenewal] = useState<string | null>(null);
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(false);
  const [lastScanDate, setLastScanDate] = useState<Date | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const navigate = useNavigate();

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    
    // Load user preferences
    (async () => {
      const ref = doc(db, "users", uid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        interface UserDoc {
          plan?: { type?: string; active?: boolean; currentPeriodEnd?: { seconds?: number } | number };
          reminders?: { enabled?: boolean };
        }
        const d = snap.data() as UserDoc;
        setPlanType(d.plan?.type ?? null);
        setPlanActive(Boolean(d.plan?.active));
        const cpe = d.plan?.currentPeriodEnd;
        setRenewal(
          cpe ? new Date(typeof cpe === "number" ? cpe : (cpe.seconds ?? 0) * 1000).toLocaleDateString() : null
        );
        
        // Load reminder preferences
        const reminders = d.reminders;
        setReminderEnabled(reminders?.enabled ?? (planActive ? true : false));
      }
    })();

    // Load latest scan date
    const scansQuery = query(
      collection(db, "users", uid, "scans"),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    
    const unsubscribe = onSnapshot(scansQuery, (snapshot) => {
      if (!snapshot.empty) {
        const latestScan = snapshot.docs[0].data();
        const createdAt = latestScan.createdAt;
        if (createdAt?.toDate) {
          setLastScanDate(createdAt.toDate());
        }
      }
    });

    return () => unsubscribe();
  }, [planActive]);

  const saveReminderPreference = async (enabled: boolean) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setSaving(true);
    try {
      const ref = doc(db, "users", uid);
      await updateDoc(ref, {
        reminders: {
          enabled,
          intervalDays: 10,
          updatedAt: serverTimestamp()
        }
      });
      setReminderEnabled(enabled);
      toast({ title: enabled ? "Reminders enabled" : "Reminders disabled" });
    } catch (error) {
      console.error("Error saving reminder preference:", error);
      toast({ title: "Failed to save preference", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getNextReminderDate = () => {
    if (!lastScanDate || !reminderEnabled) return null;
    const nextDate = new Date(lastScanDate);
    nextDate.setDate(nextDate.getDate() + 10);
    return nextDate;
  };

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

      {/* Scan Reminders */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Scan Reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label>Remind me every 10 days</Label>
              <p className="text-sm text-muted-foreground">Get notified when it's time for your next scan</p>
            </div>
            <Switch
              checked={reminderEnabled}
              onCheckedChange={saveReminderPreference}
              disabled={saving}
            />
          </div>
          
          <div className="space-y-2 text-sm text-muted-foreground">
            {lastScanDate && (
              <div>
                <span className="font-medium">Last scan:</span> {lastScanDate.toLocaleDateString()}
              </div>
            )}
            {reminderEnabled && getNextReminderDate() && (
              <div>
                <span className="font-medium">Next reminder:</span> {getNextReminderDate()?.toLocaleDateString()}
              </div>
            )}
            {!lastScanDate && (
              <div>No scans yet. Start your first scan to enable reminders.</div>
            )}
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

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Units</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/settings/units")}>Choose units</Button>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Health Integrations</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={() => navigate("/settings/health")}>Open health settings</Button>
        </CardContent>
      </Card>
    </main>
  );
};

export default Settings;
