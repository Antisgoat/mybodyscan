import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { useI18n } from "@/lib/i18n";
import { signOutAll } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { supportMailto } from "@/lib/support";
import { useFlags } from "@/lib/flags";
import { useNavigate } from "react-router-dom";
import { copyDiagnostics } from "@/lib/diagnostics";
import { isDemoActive } from "@/lib/demoFlag";
import { Download, Trash2, Loader2 } from "lucide-react";
import { SectionCard } from "@/components/Settings/SectionCard";
import { ToggleRow } from "@/components/Settings/ToggleRow";
import { useUserProfile } from "@/hooks/useUserProfile";
import { auth, db, functions as firebaseFunctions } from "@/lib/firebase";
import { setDoc } from "@/lib/dbWrite";
import { doc, getDoc } from "firebase/firestore";
import { kgToLb, lbToKg, formatHeightFromCm } from "@/lib/units";
import { DemoBanner } from "@/components/DemoBanner";
import { requestAccountDeletion, requestExportIndex } from "@/lib/account";
import { httpsCallable } from "firebase/functions";
import { useCredits } from "@/hooks/useCredits";

const Settings = () => {
  const [notifications, setNotifications] = useState({
    scanReminder: true,
    workoutReminder: true,
    checkinReminder: true,
    renewalReminder: true
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { t, language, changeLanguage, availableLanguages } = useI18n();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const [weightInput, setWeightInput] = useState("");
  const [savingMetrics, setSavingMetrics] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [refreshingClaims, setRefreshingClaims] = useState(false);
  const { environment } = useFlags();
  const { credits, unlimited, loading: creditsLoading } = useCredits();

  const creditsLabel = creditsLoading ? "…" : unlimited ? "∞" : credits;

  useEffect(() => {
    if (profile?.weight_kg != null) {
      setWeightInput(Math.round(kgToLb(profile.weight_kg)).toString());
    }
  }, [profile?.weight_kg]);

  const stripeModeLabel = environment.stripeMode === "live" ? "LIVE" : "TEST";
  const stripeBadgeVariant = environment.stripeMode === "live" ? "default" : "secondary";

  const handleSaveMetrics = async () => {
    if (!auth.currentUser) {
      toast({ title: "Sign in required", description: "Sign in to update your profile.", variant: "destructive" });
      navigate("/auth");
      return;
    }
    const weightLb = parseFloat(weightInput);
    if (!Number.isFinite(weightLb) || weightLb <= 0) {
      toast({ title: "Enter your weight", description: "Weight must be a positive number in pounds.", variant: "destructive" });
      return;
    }
    setSavingMetrics(true);
    try {
      const weightKg = Number(lbToKg(weightLb).toFixed(2));
      const profileRef = doc(db, "users", auth.currentUser.uid, "coach", "profile");
      await setDoc(profileRef, { weight_kg: weightKg }, { merge: true });
      toast({ title: "Weight updated" });
    } catch (error: any) {
      console.error("save_weight", error);
      toast({ title: "Unable to save weight", variant: "destructive" });
    } finally {
      setSavingMetrics(false);
    }
  };

  const deleteDatabase = (name: string) =>
    new Promise<void>((resolve) => {
      try {
        const request = window.indexedDB.deleteDatabase(name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });

  const handleResetLocalData = async () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.clear();
      try {
        window.sessionStorage.clear();
      } catch {
        // ignore
      }
      if (window.indexedDB) {
        const anyIndexedDB = window.indexedDB as typeof window.indexedDB & {
          databases?: () => Promise<Array<{ name?: string | undefined }>>;
        };
        const list = anyIndexedDB.databases ? await anyIndexedDB.databases() : [];
        if (Array.isArray(list)) {
          for (const info of list) {
            if (info?.name) {
              await deleteDatabase(info.name);
            }
          }
        }
        const known = [
          "firebaseLocalStorageDb",
          "firebase-heartbeat-database",
          "firebase-installations-database",
        ];
        for (const name of known) {
          await deleteDatabase(name);
        }
      }
      toast({ title: "Local data cleared" });
    } catch (error) {
      console.error("reset_local_data", error);
      toast({ title: "Unable to clear data", variant: "destructive" });
    }
  };

  const handleSignOut = async () => {
    if (isDemoActive()) {
      toast({ title: "Create a free account to save settings." });
      navigate("/auth");
      return;
    }
    await signOutAll();
    navigate("/auth");
  };

  const handleExportData = async () => {
    if (isDemoActive()) {
      toast({ title: "Create a free account to export data." });
      navigate("/auth");
      return;
    }

    try {
      setExportingData(true);
      const payload = await requestExportIndex();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mybodyscan-export-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({
        title: "Export ready",
        description: `Links expire ${new Date(payload.expiresAt).toLocaleTimeString()}.`,
      });
    } catch (error) {
      console.error("export_data", error);
      toast({ title: "Export failed", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setExportingData(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDemoActive()) {
      toast({ title: "Create a free account to manage account." });
      navigate("/auth");
      return;
    }

    try {
      setDeletingAccount(true);
      await requestAccountDeletion();
      toast({ title: "Account deleted", description: "We signed you out." });
      await signOutAll();
      navigate("/auth", { replace: true });
    } catch (error) {
      console.error("delete_account", error);
      toast({ title: "Delete failed", description: "Try again later.", variant: "destructive" });
    } finally {
      setDeletingAccount(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleRefreshClaims = async () => {
    try {
      setRefreshingClaims(true);
      const callable = httpsCallable(firebaseFunctions, "refreshClaims");
      await callable({});
      await auth.currentUser?.getIdToken(true);
      let description: string | undefined;
      const token = await auth.currentUser?.getIdTokenResult(true);
      const unlimitedActive = token?.claims?.unlimitedCredits === true;
      if (unlimitedActive) {
        description = "Unlimited credits active.";
      } else if (auth.currentUser) {
        const snapshot = await getDoc(doc(db, `users/${auth.currentUser.uid}/private/credits`));
        const remaining = snapshot.data()?.creditsSummary?.totalAvailable as number | undefined;
        if (typeof remaining === "number" && Number.isFinite(remaining)) {
          description = `Credits remaining: ${remaining}`;
        }
      }
      toast({ title: "Claims refreshed", description });
    } catch (error) {
      console.error("refresh_claims", error);
      toast({ title: "Refresh failed", description: "Try again later.", variant: "destructive" });
    } finally {
      setRefreshingClaims(false);
    }
  };


  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
        <main className="max-w-md mx-auto p-6 space-y-6">
          <Seo title="Settings - MyBodyScan" description="Manage your preferences and data." />
          <DemoBanner />
          {isDemoActive() && (
            <div className="rounded bg-muted p-2 text-center text-xs">Demo settings — sign up to save changes.</div>
          )}
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold text-foreground">{t('settings.title')}</h1>
            <Badge variant={stripeBadgeVariant} aria-label={`Stripe environment ${stripeModeLabel}`}>
              {stripeModeLabel}
            </Badge>
          </div>

        <Card>
          <CardHeader>
            <CardTitle>Body metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Height</Label>
              <p className="text-sm text-muted-foreground">{formatHeightFromCm(profile?.height_cm)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Current weight (lb)</Label>
              <Input
                id="weight"
                type="number"
                inputMode="decimal"
                placeholder="Enter weight in pounds"
                value={weightInput}
                onChange={(event) => setWeightInput(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">Saved securely in kilograms for calculations.</p>
            </div>
            <DemoWriteButton onClick={handleSaveMetrics} disabled={savingMetrics} className="w-full">
              {savingMetrics ? "Saving..." : "Save weight"}
            </DemoWriteButton>
          </CardContent>
        </Card>

        {/* Notifications */}
        <SectionCard title={t('settings.notifications')}>
          <div className="space-y-2">
            <ToggleRow
              label={t('notifications.scanReminder')}
              description="Every 10 days since last scan"
              checked={notifications.scanReminder}
              onChange={(checked) => setNotifications((prev) => ({ ...prev, scanReminder: checked }))}
            />
            <ToggleRow
              label={t('notifications.workoutReminder')}
              description="8am on planned workout days"
              checked={notifications.workoutReminder}
              onChange={(checked) => setNotifications((prev) => ({ ...prev, workoutReminder: checked }))}
            />
            <ToggleRow
              label={t('notifications.checkinReminder')}
              description="Weekly check-in reminders"
              checked={notifications.checkinReminder}
              onChange={(checked) => setNotifications((prev) => ({ ...prev, checkinReminder: checked }))}
            />
            <ToggleRow
              label={t('notifications.renewalReminder')}
              description="3 days before renewal"
              checked={notifications.renewalReminder}
              onChange={(checked) => setNotifications((prev) => ({ ...prev, renewalReminder: checked }))}
            />
          </div>
        </SectionCard>

        {/* Language */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.language')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Interface language</Label>
              <Select value={language} onValueChange={changeLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableLanguages.map((lang) => (
                    <SelectItem key={lang} value={lang}>
                      {lang === 'en' ? 'English' : lang}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Legal & Support */}
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.legal')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <a href="/legal/privacy" className="block text-sm underline hover:text-primary">
                Privacy Policy
              </a>
              <a href="/legal/terms" className="block text-sm underline hover:text-primary">
                Terms of Service
              </a>
              <a href="/legal/refund" className="block text-sm underline hover:text-primary">
                Refund Policy
              </a>
              <a href="/help" className="block text-sm underline hover:text-primary">
                Help Center
              </a>
              <Button variant="outline" className="w-full" asChild>
                <a href={supportMailto()} aria-label="Email support">
                  Email support
                </a>
              </Button>
              <p className="text-xs text-muted-foreground text-center">support@mybodyscanapp.com</p>
            </div>
          <div className="space-y-2">
            <Button
              variant="outline"
              onClick={handleExportData}
              className="w-full flex items-center gap-2"
              disabled={exportingData}
            >
              {exportingData ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              {exportingData ? "Preparing export…" : t('settings.export_data')}
            </Button>

            <Button
              variant="outline"
              onClick={handleRefreshClaims}
              className="w-full flex items-center gap-2"
              disabled={refreshingClaims}
            >
              {refreshingClaims ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {refreshingClaims ? "Refreshing…" : "Refresh claims"}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              Billing mode: {stripeModeLabel === "LIVE" ? "Live (real charges)" : "Test (no live charges)"}
            </p>
            <p className="text-xs text-muted-foreground text-center">
              Credits: {unlimited ? "∞ (unlimited)" : creditsLabel}
            </p>

            <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
              <DialogTrigger asChild>
                <Button
                  variant="destructive"
                  className="w-full flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('settings.delete_account')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete Account</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to delete your account? This action cannot be undone and will permanently remove all your data.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                    Cancel
                  </Button>
                  <DemoWriteButton
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount}
                  >
                    {deletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {deletingAccount ? "Deleting…" : "Delete Account"}
                  </DemoWriteButton>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Button
              variant="outline"
              onClick={handleSignOut}
              className="w-full"
            >
              {t('settings.sign_out')}
            </Button>
            <Button
              variant="outline"
              onClick={async () => { await copyDiagnostics(); toast({ title: "Copied diagnostics" }); }}
              className="w-full"
            >
              Copy diagnostics
            </Button>
            <Button
              variant="outline"
              onClick={handleResetLocalData}
              className="w-full"
            >
              Reset local data
            </Button>
          </div>
        </CardContent>
      </Card>
      </main>
      <BottomNav />
    </div>
  );
};

export default Settings;
