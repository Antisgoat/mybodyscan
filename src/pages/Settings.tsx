import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { useI18n } from "@/lib/i18n";
import { signOutAll } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";
import { supportMailto } from "@/lib/support";
import { Link, useNavigate } from "react-router-dom";
import { copyDiagnostics } from "@/lib/diagnostics";
import { isDemoActive } from "@/lib/demoFlag";
import { Download, Trash2, Loader2, RefreshCcw, LifeBuoy, Shield, ExternalLink, CreditCard } from "lucide-react";
import { SectionCard } from "@/components/Settings/SectionCard";
import { ToggleRow } from "@/components/Settings/ToggleRow";
import { useUserProfile } from "@/hooks/useUserProfile";
import { auth, db } from "@/lib/firebase";
import { ensureAppCheck, getAppCheckTokenHeader } from "@/lib/appcheck";
import { setDoc } from "@/lib/dbWrite";
import { doc, getDoc } from "firebase/firestore";
import { kgToLb, lbToKg, formatHeightFromCm } from "@/lib/units";
import { DemoBanner } from "@/components/DemoBanner";
import { requestAccountDeletion, requestExportIndex } from "@/lib/account";
import { useCredits } from "@/hooks/useCredits";
import HeaderEnvBadge from "@/components/HeaderEnvBadge";
import { buildHash, buildTimestamp, publishableKeySuffix, describeStripeEnvironment } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { describePortalError, openCustomerPortal } from "@/lib/payments";
import { openExternal } from "@/lib/links";
import { useClaims } from "@/lib/claims";
import { buildErrorToast } from "@/lib/errorToasts";
import { call } from "@/lib/callable";
import { useAuthUser } from "@/lib/auth";
import { useDemoMode } from "@/components/DemoModeProvider";

const Settings = () => {
  const [notifications, setNotifications] = useState({
    scanReminder: true,
    workoutReminder: true,
    checkinReminder: true,
    renewalReminder: true
  });
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const { t, language, changeLanguage, availableLanguages } = useI18n();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const [weightInput, setWeightInput] = useState("");
  const [savingMetrics, setSavingMetrics] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [refreshingClaims, setRefreshingClaims] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const { credits, unlimited, loading: creditsLoading } = useCredits();
  const { refresh: refreshClaimsHook } = useClaims();
  const { user } = useAuthUser();
  const demoMode = useDemoMode();
  const [appCheckStatus, setAppCheckStatus] = useState<"checking" | "present" | "absent">("checking");
  const stripePublishablePresent = Boolean((import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "").trim());

  const deleteDialogOpen = deleteStep > 0;
  const canAdvanceDelete = deleteConfirmInput.trim().toUpperCase() === "DELETE";
  const stripeEnvironment = describeStripeEnvironment();
  const showBuildInfo = import.meta.env.DEV;
  const buildCommit = (import.meta.env.VITE_COMMIT_SHA ? String(import.meta.env.VITE_COMMIT_SHA).slice(0, 7) : buildHash) || "dev";
  const buildTime = import.meta.env.VITE_BUILD_TIME
    ? String(import.meta.env.VITE_BUILD_TIME)
    : buildTimestamp
    ? new Date(buildTimestamp).toLocaleString()
    : "";
  const environmentBadgeLabel =
    stripeEnvironment === "live"
      ? "LIVE"
      : stripeEnvironment === "test"
      ? "TEST"
      : stripeEnvironment === "custom"
      ? "CUSTOM"
      : "MISSING";
  const environmentTone =
    stripeEnvironment === "live"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : stripeEnvironment === "test"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : stripeEnvironment === "custom"
      ? "bg-sky-500/10 text-sky-600 dark:text-sky-300"
      : "bg-destructive/10 text-destructive";

  const creditsLabel = creditsLoading ? "…" : unlimited ? "∞" : credits;

  useEffect(() => {
    if (profile?.weight_kg != null) {
      setWeightInput(Math.round(kgToLb(profile.weight_kg)).toString());
    }
  }, [profile?.weight_kg]);

  useEffect(() => {
    let active = true;
    if (!user) {
      setAppCheckStatus("checking");
      return () => {
        active = false;
      };
    }
    (async () => {
      try {
        await ensureAppCheck();
        const headers = await getAppCheckTokenHeader();
        if (active) {
          setAppCheckStatus(Object.keys(headers).length > 0 ? "present" : "absent");
        }
      } catch {
        if (active) {
          setAppCheckStatus("absent");
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

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
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: { title: "Unable to save weight", description: "Try again later.", variant: "destructive" },
        }),
      );
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
      toast(
        buildErrorToast(error, {
          fallback: { title: "Unable to clear data", description: "Try again later.", variant: "destructive" },
        }),
      );
    }
  };

  const handleOpenBillingPortal = async () => {
    try {
      setOpeningPortal(true);
      const result = await openCustomerPortal({ navigate: false });
      const url = result?.url;
      if (url) {
        openExternal(url);
        return;
      }
      toast({ title: "Portal unavailable", description: "Try again shortly.", variant: "destructive" });
    } catch (error) {
      const code = typeof (error as any)?.code === "string" ? (error as any).code : undefined;
      const description = describePortalError(code);
      const fallback = {
        title: "Unable to open billing portal",
        description: import.meta.env.DEV && code ? `${description} (${code})` : description,
        variant: "destructive" as const,
      };
      toast(
        buildErrorToast(error, {
          fallback,
          includeCodeInDev: false,
        }),
      );
    } finally {
      setOpeningPortal(false);
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
      toast(
        buildErrorToast(error, {
          fallback: { title: "Export failed", description: "Try again in a moment.", variant: "destructive" },
        }),
      );
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
      toast(
        buildErrorToast(error, {
          fallback: { title: "Delete failed", description: "Try again later.", variant: "destructive" },
        }),
      );
    } finally {
      setDeletingAccount(false);
      setDeleteStep(0);
      setDeleteConfirmInput("");
    }
  };

  const handleOpenDelete = () => {
    setDeleteConfirmInput("");
    setDeleteStep(1);
  };

  const handleCloseDelete = () => {
    setDeleteConfirmInput("");
    setDeleteStep(0);
  };

  const handleRefreshClaims = async () => {
    const user = auth.currentUser;
    if (!user) {
      toast({ title: "Sign in required", description: "Sign in to refresh claims.", variant: "destructive" });
      navigate("/auth");
      return;
    }

    try {
      setRefreshingClaims(true);
      await call("refreshClaims", {});

      const claims = await refreshClaimsHook(true);

      let description: string | undefined;
      if (claims?.unlimited === true || claims?.unlimitedCredits === true) {
        description = "Unlimited credits active.";
      } else if (typeof claims?.credits === "number" && Number.isFinite(claims.credits)) {
        description = `Credits remaining: ${claims.credits}`;
      } else {
        const snapshot = await getDoc(doc(db, `users/${user.uid}/private/credits`));
        const remaining = snapshot.data()?.creditsSummary?.totalAvailable as number | undefined;
        if (typeof remaining === "number" && Number.isFinite(remaining)) {
          description = `Credits remaining: ${remaining}`;
        }
      }

      toast({ title: "Claims refreshed", description });
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: { title: "Refresh failed", description: "Try again later.", variant: "destructive" },
        }),
      );
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
            <div>
              <h1 className="text-2xl font-semibold text-foreground">{t('settings.title')}</h1>
              <p className="text-xs text-muted-foreground">Securely manage your account, data, and preferences.</p>
            </div>
            <HeaderEnvBadge />
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

      {user ? (
        <Card>
          <CardHeader>
            <CardTitle>Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded border px-3 py-2">
              <span>App Check</span>
              <Badge variant={appCheckStatus === "present" ? "default" : "secondary"} className="uppercase tracking-wide">
                {appCheckStatus === "checking"
                  ? "Checking"
                  : appCheckStatus === "present"
                    ? "Token present"
                    : "Token missing"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded border px-3 py-2">
              <span>Demo mode</span>
              <Badge variant={demoMode ? "secondary" : "outline"} className="uppercase tracking-wide">
                {demoMode ? "ON" : "OFF"}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded border px-3 py-2">
              <span>Auth email</span>
              <span className="font-medium text-foreground">{user.email || "(none)"}</span>
            </div>
            <div className="flex items-center justify-between rounded border px-3 py-2">
              <span>Stripe publishable key</span>
              <Badge variant={stripePublishablePresent ? "default" : "destructive"} className="uppercase tracking-wide">
                {stripePublishablePresent ? "Present" : "Missing"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ) : null}

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

        {/* Account & data */}
        <Card>
          <CardHeader>
            <CardTitle>Account &amp; data</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Download your history or permanently remove your account. These tools affect only your MyBodyScan data.
            </p>
            <div className="grid gap-2">
              <Button
                variant="outline"
                onClick={handleExportData}
                className="w-full flex items-center gap-2"
                disabled={exportingData}
              >
                {exportingData ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                {exportingData ? "Preparing export…" : t('settings.export_data')}
              </Button>
              <Button
                variant="outline"
                onClick={handleRefreshClaims}
                className="w-full flex items-center gap-2"
                disabled={refreshingClaims}
              >
                {refreshingClaims ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                {refreshingClaims ? "Refreshing…" : "Refresh claims"}
              </Button>
              <p className="text-xs text-muted-foreground text-center" role="status" aria-live="polite">
                Credits: {unlimited ? "∞ (unlimited)" : creditsLabel}
              </p>
            </div>
            <div className="rounded border border-destructive/40 bg-destructive/5 p-3 space-y-2">
              <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Irreversible delete
              </h3>
              <p className="text-xs text-muted-foreground">
                This will revoke access, remove scans, and delete uploaded photos. Sign back in to start fresh.
              </p>
              <Button variant="destructive" className="w-full" onClick={handleOpenDelete} disabled={deletingAccount}>
                {deletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {deletingAccount ? "Deleting…" : t('settings.delete_account')}
              </Button>
            </div>
            <Button variant="outline" onClick={handleSignOut} className="w-full">
              {t('settings.sign_out')}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                await copyDiagnostics();
                toast({ title: "Copied diagnostics" });
              }}
              className="w-full"
            >
              Copy diagnostics
            </Button>
            <Button variant="outline" onClick={handleResetLocalData} className="w-full">
              Reset local data
            </Button>
          </CardContent>
        </Card>

        {/* Support & legal */}
        <Card>
          <CardHeader>
            <CardTitle>Support &amp; legal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between rounded-md border border-muted px-3 py-2 text-sm">
                <span>Environment</span>
                <Badge className={`uppercase tracking-wide ${environmentTone}`}>{environmentBadgeLabel}</Badge>
              </div>
              <Button
                variant="outline"
                onClick={handleOpenBillingPortal}
                className="w-full flex items-center justify-center gap-2"
                disabled={openingPortal}
              >
                {openingPortal ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {openingPortal ? "Opening portal…" : "Open billing portal"}
              </Button>
            </div>
            <div className="grid gap-2">
              <Button variant="outline" asChild className="w-full flex items-center gap-2 justify-center">
                <a href={supportMailto()} aria-label="Email support">
                  <LifeBuoy className="h-4 w-4" /> Email support
                </a>
              </Button>
              <Button variant="ghost" asChild className="justify-start gap-2 text-left text-sm">
                <a href="/help" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Help Center
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button variant="ghost" asChild className="justify-start gap-2 text-left text-sm">
                <a href="/legal/privacy" className="flex items-center gap-2">
                  Privacy Policy
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button variant="ghost" asChild className="justify-start gap-2 text-left text-sm">
                <a href="/legal/terms" className="flex items-center gap-2">
                  Terms of Service
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button variant="ghost" asChild className="justify-start gap-2 text-left text-sm">
                <a href="/legal/refund" className="flex items-center gap-2">
                  Refund Policy
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button variant="ghost" asChild className="justify-start gap-2 text-left text-sm">
                <Link to="/system/check" className="flex items-center gap-2">
                  System check
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
            </div>
            <div className="rounded bg-muted p-3 text-xs text-muted-foreground space-y-1">
              <div>Version: {buildCommit}{buildTime ? ` • ${buildTime}` : ""}</div>
              <div>Stripe mode: {stripeEnvironment === "live" ? "Live" : stripeEnvironment === "test" ? "Test" : stripeEnvironment === "custom" ? "Custom key" : "Missing"}</div>
              <div>Publishable key suffix: {publishableKeySuffix || "n/a"}</div>
              {showBuildInfo ? (
                <div>
                  Build {buildHash}
                  {buildTimestamp ? ` • ${new Date(buildTimestamp).toLocaleString()}` : ""}
                </div>
              ) : null}
            </div>
            <p className="text-center text-xs text-muted-foreground">support@mybodyscanapp.com</p>
          </CardContent>
        </Card>

        <Dialog open={deleteDialogOpen} onOpenChange={(open) => (open ? setDeleteStep((prev) => (prev === 0 ? 1 : prev)) : handleCloseDelete())}>
          <DialogContent>
            {deleteStep === 1 ? (
              <>
                <DialogHeader>
                  <DialogTitle>Confirm delete</DialogTitle>
                  <DialogDescription>
                    Type <span className="font-semibold">DELETE</span> to continue. This starts the permanent removal process.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  autoFocus
                  value={deleteConfirmInput}
                  onChange={(event) => setDeleteConfirmInput(event.target.value)}
                  placeholder="Type DELETE"
                  aria-label="Type DELETE to confirm"
                />
                <DialogFooter>
                  <Button variant="outline" onClick={handleCloseDelete}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={() => setDeleteStep(2)} disabled={!canAdvanceDelete}>
                    Continue
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Final confirmation</DialogTitle>
                  <DialogDescription>
                    This will revoke access, delete scans, and erase uploads immediately. You cannot undo this action.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={handleCloseDelete}>
                    Cancel
                  </Button>
                  <DemoWriteButton variant="destructive" onClick={handleDeleteAccount} disabled={deletingAccount}>
                    {deletingAccount ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {deletingAccount ? "Deleting…" : "Delete forever"}
                  </DemoWriteButton>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </main>
      <BottomNav />
    </div>
  );
};

export default Settings;
