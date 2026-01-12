/**
 * Pipeline map — Settings, units, and feature toggles:
 * - Surfaces `useUnits` + `useSystemHealth` so users can change unit preferences while seeing which services (scan/nutrition/workouts)
 *   are configured.
 * - Also exposes App Check/claims diagnostics that influence scan credits and nutrition logging availability.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { DemoWriteButton } from "@/components/DemoWriteGuard";
import { Input } from "@/components/ui/input";
import HeightInputUS from "@/components/HeightInputUS";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BottomNav } from "@/components/BottomNav";
import { Seo } from "@/components/Seo";
import { useI18n } from "@/lib/i18n";
import { signOut } from "@/auth/mbs-auth";
import { toast } from "@/hooks/use-toast";
import { supportMailto } from "@/lib/support";
import { Link, useNavigate } from "react-router-dom";
import { copyDiagnostics } from "@/lib/diagnostics";
import { isDemoActive } from "@/lib/demoFlag";
import {
  Download,
  Trash2,
  Loader2,
  RefreshCcw,
  LifeBuoy,
  Shield,
  ExternalLink,
  CreditCard,
} from "lucide-react";
import { SectionCard } from "@/components/Settings/SectionCard";
import { ToggleRow } from "@/components/Settings/ToggleRow";
import { useUserProfile } from "@/hooks/useUserProfile";
import type { CoachSex } from "@/hooks/useUserProfile";
import {
  db,
  getFirebaseConfig,
} from "@/lib/firebase";
import { ensureAppCheck, getAppCheckTokenHeader } from "@/lib/appCheck";
import { setDoc } from "@/lib/dbWrite";
import { doc, getDoc } from "firebase/firestore";
import { kgToLb, lbToKg, formatHeightFromCm } from "@/lib/units";
import { DemoBanner } from "@/components/DemoBanner";
import { requestAccountDeletion, requestExportIndex } from "@/lib/account";
import { useCredits } from "@/hooks/useCredits";
import HeaderEnvBadge from "@/components/HeaderEnvBadge";
import { buildHash, buildTimestamp, publishableKeySuffix } from "@/lib/env";
import { Badge } from "@/components/ui/badge";
import { describePortalError, openCustomerPortal } from "@/lib/payments";
import { openExternal } from "@/lib/links";
import { useClaims } from "@/lib/claims";
import { buildErrorToast } from "@/lib/errorToasts";
import { call } from "@/lib/callable";
import { useAuthUser } from "@/auth/mbs-auth";
import { useDemoMode } from "@/components/DemoModeProvider";
import { useUnits } from "@/hooks/useUnits";
import { computeFeatureStatuses } from "@/lib/envStatus";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { isIOSSafari } from "@/lib/isIOSWeb";
import { getInitAuthState } from "@/lib/auth/initAuth";
import { isNativeCapacitor } from "@/lib/platform";

const Settings = () => {
  const DEVELOPER_EMAIL = "developer@adlrlabs.com";
  const TESTER_UIDS = [
    "DbGEQQuSE2agIIqTUBkaAYCYCP92",
    "iYnHMbPSV1aJCyc3cIsdz1dLm092",
    "ww481RPvMYZzwn5vLX8FXyRlGVV2",
    "GBdtbwUcYGYMuA1QW0Ik6K9tP0w1",
  ] as const;
  const [notifications, setNotifications] = useState({
    scanReminder: true,
    workoutReminder: true,
    checkinReminder: true,
    renewalReminder: true,
  });
  const [deleteStep, setDeleteStep] = useState<0 | 1 | 2>(0);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState("");
  const { t, language, changeLanguage, availableLanguages } = useI18n();
  const navigate = useNavigate();
  const { profile } = useUserProfile();
  const [heightInputCm, setHeightInputCm] = useState<number | undefined>();
  const [weightInput, setWeightInput] = useState("");
  const [sexInput, setSexInput] = useState<CoachSex>("unspecified");
  const [ageInput, setAgeInput] = useState("");
  const [savingMetrics, setSavingMetrics] = useState(false);
  const [exportingData, setExportingData] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [refreshingClaims, setRefreshingClaims] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const { credits, unlimited, loading: creditsLoading } = useCredits();
  const { refresh: refreshClaimsHook } = useClaims();
  const { user } = useAuthUser();
  const demoMode = useDemoMode();
  const [grantingTesterPro, setGrantingTesterPro] = useState(false);
  const [testerProResult, setTesterProResult] = useState<{
    updated: string[];
    failed: Array<{ uid: string; error: string }>;
  } | null>(null);
  const [appCheckStatus, setAppCheckStatus] = useState<
    "checking" | "present" | "absent"
  >("checking");
  const { units } = useUnits();
  const { health: systemHealth } = useSystemHealth();
  const {
    statuses: featureStatuses,
    stripeMode,
    stripeConfigured,
  } = computeFeatureStatuses(systemHealth ?? undefined);
  // Stripe is web-only; native builds use in-app purchases.
  const iosBuild = isNativeCapacitor();

  const deleteDialogOpen = deleteStep > 0;
  const canAdvanceDelete = deleteConfirmInput.trim().toUpperCase() === "DELETE";
  const showBuildInfo = import.meta.env.DEV;
  const buildCommit =
    (import.meta.env.VITE_COMMIT_SHA
      ? String(import.meta.env.VITE_COMMIT_SHA).slice(0, 7)
      : buildHash) || "dev";
  const buildTime = import.meta.env.VITE_BUILD_TIME
    ? String(import.meta.env.VITE_BUILD_TIME)
    : buildTimestamp
      ? new Date(buildTimestamp).toLocaleString()
      : "";
  const environmentBadgeLabel =
    stripeMode === "live"
      ? "LIVE"
      : stripeMode === "test"
        ? "TEST"
        : stripeMode === "custom"
          ? "CUSTOM"
          : "MISSING";
  const environmentTone =
    stripeMode === "live"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : stripeMode === "test"
        ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
        : stripeMode === "custom"
          ? "bg-sky-500/10 text-sky-600 dark:text-sky-300"
          : "bg-destructive/10 text-destructive";

  const creditsLabel = creditsLoading ? "…" : unlimited ? "∞" : credits;
  const firebaseCfg = getFirebaseConfig();
  const runtimeHost =
    typeof window !== "undefined" ? window.location.hostname : "";
  const runtimeOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const authDomain = String(firebaseCfg?.authDomain || "").trim();
  const authDomainMismatch =
    import.meta.env.PROD &&
    Boolean(runtimeHost) &&
    Boolean(authDomain) &&
    runtimeHost.toLowerCase() !== authDomain.toLowerCase();
  const persistenceMode = isNativeCapacitor() ? "native" : "unknown";
  const iosSafari = isIOSSafari();
  const nativeCapacitor = isNativeCapacitor();
  const initAuthState = getInitAuthState();
  const canSeeAdminTools =
    typeof user?.email === "string" &&
    user.email.trim().toLowerCase() === DEVELOPER_EMAIL;

  useEffect(() => {
    if (profile?.weight_kg != null) {
      const normalized =
        units === "metric" ? profile.weight_kg : kgToLb(profile.weight_kg);
      setWeightInput(Math.round(normalized).toString());
    }
  }, [profile?.weight_kg, units]);

  useEffect(() => {
    const nextHeight =
      typeof profile?.heightCm === "number" && Number.isFinite(profile.heightCm)
        ? profile.heightCm
        : typeof profile?.height_cm === "number" && Number.isFinite(profile.height_cm)
          ? profile.height_cm
          : undefined;
    setHeightInputCm(nextHeight);
  }, [profile?.heightCm, profile?.height_cm]);

  useEffect(() => {
    if (
      profile?.sex === "male" ||
      profile?.sex === "female" ||
      profile?.sex === "other" ||
      profile?.sex === "unspecified"
    ) {
      setSexInput(profile.sex);
    } else {
      setSexInput("unspecified");
    }
    if (typeof profile?.age === "number" && Number.isFinite(profile.age)) {
      setAgeInput(String(Math.round(profile.age)));
    } else {
      setAgeInput("");
    }
  }, [profile?.age, profile?.sex]);

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
          setAppCheckStatus(
            Object.keys(headers).length > 0 ? "present" : "absent"
          );
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
    if (!user) {
      toast({
        title: "Sign in required",
        description: "Sign in to update your profile.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }
    const parsedWeight = parseFloat(weightInput);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      toast({
        title: "Enter your weight",
        description: `Weight must be a positive number in ${units === "metric" ? "kilograms" : "pounds"}.`,
        variant: "destructive",
      });
      return;
    }
    const normalizedHeightCm =
      typeof heightInputCm === "number" && Number.isFinite(heightInputCm) && heightInputCm > 0
        ? Math.round(heightInputCm)
        : undefined;
    const trimmedAge = ageInput.trim();
    const parsedAge =
      trimmedAge.length > 0 ? Number(trimmedAge) : undefined;
    if (parsedAge != null && (!Number.isFinite(parsedAge) || parsedAge < 13 || parsedAge > 100)) {
      toast({
        title: "Enter a valid age",
        description: "Age must be between 13 and 100.",
        variant: "destructive",
      });
      return;
    }
    setSavingMetrics(true);
    try {
      const weightKg = Number(
        (units === "metric" ? parsedWeight : lbToKg(parsedWeight)).toFixed(2)
      );
      const profileRef = doc(
        db,
        "users",
        user.uid,
        "coach",
        "profile"
      );
      const unit = units === "metric" ? "kg" : "lb";
      const payload: Record<string, unknown> = {
        weightKg,
        weight_kg: weightKg,
        unit,
      };
      if (normalizedHeightCm) {
        payload.height_cm = normalizedHeightCm;
        payload.heightCm = normalizedHeightCm;
      }
      const normalizedSex: CoachSex =
        sexInput === "male" || sexInput === "female" || sexInput === "other"
          ? sexInput
          : "unspecified";
      payload.sex = normalizedSex;
      if (parsedAge != null) {
        payload.age = Math.round(parsedAge);
      }
      await setDoc(profileRef, payload, { merge: true });
      toast({ title: "Metrics updated" });
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: {
            title: "Unable to save weight",
            description: "Try again later.",
            variant: "destructive",
          },
        })
      );
    } finally {
      setSavingMetrics(false);
    }
  };

  const deleteDatabase = (name: string) =>
    new Promise<void>((resolve) => {
      try {
        const request = window.indexedDB.deleteDatabase(name);
        request.onsuccess =
          request.onerror =
          request.onblocked =
            () => resolve();
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
        const list = anyIndexedDB.databases
          ? await anyIndexedDB.databases()
          : [];
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
          fallback: {
            title: "Unable to clear data",
            description: "Try again later.",
            variant: "destructive",
          },
        })
      );
    }
  };

  const handleOpenBillingPortal = async () => {
    if (iosBuild) {
      toast({
        title: "Available on web",
        description: "Billing is disabled in the iOS build. Use the web app.",
      });
      return;
    }
    try {
      setOpeningPortal(true);
      const result = await openCustomerPortal({ navigate: false });
      const url = result?.url;
      if (url) {
        openExternal(url);
        return;
      }
      toast({
        title: "Portal unavailable",
        description: "Try again shortly.",
        variant: "destructive",
      });
    } catch (error) {
      const code =
        typeof (error as any)?.code === "string"
          ? (error as any).code
          : undefined;
      const description = describePortalError(code);
      const fallback = {
        title: "Unable to open billing portal",
        description:
          import.meta.env.DEV && code
            ? `${description} (${code})`
            : description,
        variant: "destructive" as const,
      };
      toast(
        buildErrorToast(error, {
          fallback,
          includeCodeInDev: false,
        })
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
    await signOut();
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
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
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
        description: `Export generated at ${new Date().toLocaleTimeString()}.`,
      });
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: {
            title: "Export failed",
            description: "Try again in a moment.",
            variant: "destructive",
          },
        })
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
      await signOut();
      navigate("/auth", { replace: true });
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: {
            title: "Delete failed",
            description: "Try again later.",
            variant: "destructive",
          },
        })
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
    const currentUser = user;
    if (!currentUser) {
      toast({
        title: "Sign in required",
        description: "Sign in to refresh claims.",
        variant: "destructive",
      });
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
      } else if (
        typeof claims?.credits === "number" &&
        Number.isFinite(claims.credits)
      ) {
        description = `Credits remaining: ${claims.credits}`;
      } else {
        const snapshot = await getDoc(
          doc(db, `users/${currentUser.uid}/private/credits`)
        );
        const remaining = snapshot.data()?.creditsSummary?.totalAvailable as
          | number
          | undefined;
        if (typeof remaining === "number" && Number.isFinite(remaining)) {
          description = `Credits remaining: ${remaining}`;
        }
      }

      toast({ title: "Claims refreshed", description });
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: {
            title: "Refresh failed",
            description: "Try again later.",
            variant: "destructive",
          },
        })
      );
    } finally {
      setRefreshingClaims(false);
    }
  };

  const handleGrantProToTesters = async () => {
    if (!user?.uid) {
      toast({
        title: "Sign in required",
        description: "Sign in to run admin actions.",
        variant: "destructive",
      });
      return;
    }
    setGrantingTesterPro(true);
    setTesterProResult(null);
    try {
      const res = await call<
        { uids: string[]; pro?: boolean },
        { updated: string[]; failed: Array<{ uid: string; error: string }> }
      >("adminGrantProEntitlements", { uids: [...TESTER_UIDS], pro: true });
      const updated = Array.isArray(res?.data?.updated) ? res.data.updated : [];
      const failed = Array.isArray(res?.data?.failed) ? res.data.failed : [];
      setTesterProResult({ updated, failed });

      if (failed.length) {
        toast({
          title: "Partial success",
          description: `Updated ${updated.length}; failed ${failed.length}. See details below.`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Pro granted",
          description:
            "Tester entitlements updated. Testers may need to refresh or relaunch to see Pro access.",
        });
      }
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: {
            title: "Grant failed",
            description:
              "You are not authorized, or a server error occurred. Check logs and try again.",
            variant: "destructive",
          },
        })
      );
    } finally {
      setGrantingTesterPro(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-16 md:pb-0">
      <main className="max-w-md mx-auto p-6 space-y-6">
        <Seo
          title="Settings - MyBodyScan"
          description="Manage your preferences and data."
        />
        <DemoBanner />
        {isDemoActive() && (
          <div className="rounded bg-muted p-2 text-center text-xs">
            Demo settings — sign up to save changes.
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              {t("settings.title")}
            </h1>
            <p className="text-xs text-muted-foreground">
              Securely manage your account, data, and preferences.
            </p>
          </div>
          <HeaderEnvBadge />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Feature availability</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {featureStatuses.map((status) => (
              <div
                key={status.id}
                className="flex items-start justify-between gap-3 rounded border px-3 py-2"
              >
                <div className="flex-1">
                  <span className="font-medium">{status.label}</span>
                  {status.detail && (
                    <p className="text-xs text-muted-foreground">
                      {status.detail}
                    </p>
                  )}
                </div>
                <Badge variant={status.configured ? "default" : "secondary"}>
                  {status.configured ? status.okLabel : status.warnLabel}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Body metrics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sex">Sex</Label>
              <Select value={sexInput} onValueChange={(value) => setSexInput(value as CoachSex)}>
                <SelectTrigger id="sex">
                  <SelectValue placeholder="Select sex" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unspecified">Unspecified</SelectItem>
                  <SelectItem value="male">Male</SelectItem>
                  <SelectItem value="female">Female</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Used for BMR/TDEE and fat percent ranges. Defaults to unspecified.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="age">Age</Label>
              <Input
                id="age"
                type="number"
                inputMode="numeric"
                min={13}
                max={100}
                placeholder="Enter age in years"
                value={ageInput}
                onChange={(event) => setAgeInput(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Must be between 13 and 100.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="height">
                Height ({units === "metric" ? "cm" : "ft/in"})
              </Label>
              {units === "metric" ? (
                <Input
                  id="height"
                  type="number"
                  inputMode="decimal"
                  placeholder="Enter height in centimeters"
                  value={heightInputCm ?? ""}
                  onChange={(event) => {
                    const next = parseFloat(event.target.value);
                    setHeightInputCm(Number.isFinite(next) ? next : undefined);
                  }}
                />
              ) : (
                <HeightInputUS
                  valueCm={heightInputCm}
                  onChangeCm={(cm) =>
                    setHeightInputCm(
                      Number.isFinite(cm) && cm > 0 ? Number(cm) : undefined
                    )
                  }
                />
              )}
              <p className="text-xs text-muted-foreground">
                Saved securely to improve scan estimates.
              </p>
              {formatHeightFromCm(heightInputCm ?? profile?.heightCm ?? profile?.height_cm) ? (
                <p className="text-xs text-muted-foreground">
                  Current: {formatHeightFromCm(heightInputCm ?? profile?.heightCm ?? profile?.height_cm)}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">
                Current weight ({units === "metric" ? "kg" : "lb"})
              </Label>
              <Input
                id="weight"
                type="number"
                inputMode="decimal"
                placeholder={
                  units === "metric"
                    ? "Enter weight in kilograms"
                    : "Enter weight in pounds"
                }
                value={weightInput}
                onChange={(event) => setWeightInput(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Saved securely in kilograms for calculations.
              </p>
            </div>
            <DemoWriteButton
              onClick={handleSaveMetrics}
              disabled={savingMetrics}
              className="w-full"
            >
              {savingMetrics ? "Saving..." : "Save metrics"}
            </DemoWriteButton>
          </CardContent>
        </Card>

        {user ? (
          <Card>
            <CardHeader>
              <CardTitle>Diagnostics</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {authDomainMismatch ? (
                <div className="rounded border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <div className="font-semibold">
                    Auth misconfiguration: authDomain must match this site
                  </div>
                  <div>
                    Running on <span className="font-mono">{runtimeHost}</span>{" "}
                    but Firebase authDomain is{" "}
                    <span className="font-mono">{authDomain}</span>.
                  </div>
                </div>
              ) : null}
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span>App Check</span>
                <Badge
                  variant={
                    appCheckStatus === "present" ? "default" : "secondary"
                  }
                  className="uppercase tracking-wide"
                >
                  {appCheckStatus === "checking"
                    ? "Checking"
                    : appCheckStatus === "present"
                      ? "Token present"
                      : "Token missing"}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span>Demo mode</span>
                <Badge
                  variant={demoMode ? "secondary" : "outline"}
                  className="uppercase tracking-wide"
                >
                  {demoMode ? "ON" : "OFF"}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span>Auth email</span>
                <span className="font-medium text-foreground">
                  {user.email || "(none)"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span>Origin</span>
                <span className="font-mono text-[11px] text-foreground">
                  {runtimeOrigin || "(unknown)"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span>Firebase authDomain</span>
                <span className="font-mono text-[11px] text-foreground">
                  {authDomain || "(unknown)"}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span>iOS Safari</span>
                <Badge
                  variant={iosSafari ? "secondary" : "outline"}
                  className="uppercase tracking-wide"
                >
                  {iosSafari ? "YES" : "NO"}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span>Capacitor native</span>
                <Badge
                  variant={nativeCapacitor ? "secondary" : "outline"}
                  className="uppercase tracking-wide"
                >
                  {nativeCapacitor ? "YES" : "NO"}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span>Auth persistence</span>
                <Badge className="uppercase tracking-wide" variant="outline">
                  {persistenceMode}
                </Badge>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span>Auth boot</span>
                <span className="text-xs text-muted-foreground">
                  {initAuthState.completed
                    ? "ready"
                    : initAuthState.started
                      ? "starting"
                      : "not-started"}
                  {initAuthState.redirectError
                    ? ` • redirectError`
                    : ""}
                </span>
              </div>
              <div className="flex items-center justify-between rounded border px-3 py-2">
                <span>Stripe publishable key</span>
                <Badge
                  variant={stripeConfigured ? "default" : "destructive"}
                  className="uppercase tracking-wide"
                >
                  {stripeConfigured ? "Present" : "Missing"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {canSeeAdminTools ? (
          <Card>
            <CardHeader>
              <CardTitle>Admin tools</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Restricted to{" "}
                <span className="font-mono">{DEVELOPER_EMAIL}</span>.
              </p>
              <div className="rounded border px-3 py-2">
                <p className="text-xs font-medium text-foreground">
                  Tester UIDs (fixed)
                </p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {TESTER_UIDS.map((uid) => (
                    <li key={uid} className="font-mono">
                      {uid}
                    </li>
                  ))}
                </ul>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleGrantProToTesters}
                disabled={grantingTesterPro}
              >
                {grantingTesterPro ? "Granting…" : "Grant Pro to Testers"}
              </Button>
              {testerProResult ? (
                <div className="space-y-2 rounded border px-3 py-2 text-xs">
                  <div>
                    <div className="font-medium text-foreground">Updated</div>
                    <div className="text-muted-foreground">
                      {testerProResult.updated.length
                        ? testerProResult.updated.join(", ")
                        : "None"}
                    </div>
                  </div>
                  <div>
                    <div className="font-medium text-foreground">Failed</div>
                    {testerProResult.failed.length ? (
                      <ul className="mt-1 space-y-1 text-muted-foreground">
                        {testerProResult.failed.map((row) => (
                          <li key={`${row.uid}-${row.error}`}>
                            <span className="font-mono">{row.uid}</span> —{" "}
                            {row.error}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-muted-foreground">None</div>
                    )}
                  </div>
                  <p className="text-muted-foreground">
                    Note: testers may need to refresh/relaunch to pick up Pro.
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {/* Notifications */}
        <SectionCard title={t("settings.notifications")}>
          <div className="space-y-2">
            <ToggleRow
              label={t("notifications.scanReminder")}
              description="Every 10 days since last scan"
              checked={notifications.scanReminder}
              onChange={(checked) =>
                setNotifications((prev) => ({ ...prev, scanReminder: checked }))
              }
            />
            <ToggleRow
              label={t("notifications.workoutReminder")}
              description="8am on planned workout days"
              checked={notifications.workoutReminder}
              onChange={(checked) =>
                setNotifications((prev) => ({
                  ...prev,
                  workoutReminder: checked,
                }))
              }
            />
            <ToggleRow
              label={t("notifications.checkinReminder")}
              description="Weekly check-in reminders"
              checked={notifications.checkinReminder}
              onChange={(checked) =>
                setNotifications((prev) => ({
                  ...prev,
                  checkinReminder: checked,
                }))
              }
            />
            <ToggleRow
              label={t("notifications.renewalReminder")}
              description="3 days before renewal"
              checked={notifications.renewalReminder}
              onChange={(checked) =>
                setNotifications((prev) => ({
                  ...prev,
                  renewalReminder: checked,
                }))
              }
            />
          </div>
        </SectionCard>

        {/* Language */}
        <Card>
          <CardHeader>
            <CardTitle>{t("settings.language")}</CardTitle>
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
                      {lang === "en" ? "English" : lang}
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
              Download your history or permanently remove your account. These
              tools affect only your MyBodyScan data.
            </p>
            <div className="grid gap-2">
              <a
                href="/settings/account"
                className="inline-flex items-center justify-center rounded border px-3 py-2 text-sm"
              >
                Account &amp; Privacy
              </a>
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
                {exportingData
                  ? "Preparing export…"
                  : t("settings.export_data")}
              </Button>
              <Button
                variant="outline"
                onClick={handleRefreshClaims}
                className="w-full flex items-center gap-2"
                disabled={refreshingClaims}
              >
                {refreshingClaims ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCcw className="w-4 h-4" />
                )}
                {refreshingClaims ? "Refreshing…" : "Refresh claims"}
              </Button>
              <p
                className="text-xs text-muted-foreground text-center"
                role="status"
                aria-live="polite"
              >
                Credits: {unlimited ? "∞ (unlimited)" : creditsLabel}
              </p>
            </div>
            <div className="rounded border border-destructive/40 bg-destructive/5 p-3 space-y-2">
              <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
                <Trash2 className="h-4 w-4" /> Irreversible delete
              </h3>
              <p className="text-xs text-muted-foreground">
                This will revoke access, remove scans, and delete uploaded
                photos. Sign back in to start fresh.
              </p>
              <Button
                variant="destructive"
                className="w-full"
                onClick={handleOpenDelete}
                disabled={deletingAccount}
              >
                {deletingAccount ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                {deletingAccount ? "Deleting…" : t("settings.delete_account")}
              </Button>
            </div>
            <Button
              variant="outline"
              onClick={handleSignOut}
              className="w-full"
            >
              {t("settings.sign_out")}
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
            <Button
              variant="outline"
              onClick={handleResetLocalData}
              className="w-full"
            >
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
                <Badge className={`uppercase tracking-wide ${environmentTone}`}>
                  {environmentBadgeLabel}
                </Badge>
              </div>
              <Button
                variant="outline"
                onClick={handleOpenBillingPortal}
                className="w-full flex items-center justify-center gap-2"
                disabled={openingPortal || iosBuild}
              >
                {openingPortal ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CreditCard className="h-4 w-4" />
                )}
                {iosBuild
                  ? "Billing available on web"
                  : openingPortal
                    ? "Opening portal…"
                    : "Open billing portal"}
              </Button>
                {iosBuild && (
                  <p className="mt-2 text-center text-xs text-muted-foreground">
                    Billing is available on web.
                  </p>
                )}
            </div>
            <div className="grid gap-2">
              <Button
                variant="outline"
                asChild
                className="w-full flex items-center gap-2 justify-center"
              >
                <a href={supportMailto()} aria-label="Email support">
                  <LifeBuoy className="h-4 w-4" /> Email support
                </a>
              </Button>
              <Button
                variant="ghost"
                asChild
                className="justify-start gap-2 text-left text-sm"
              >
                <a href="/help" className="flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Help Center
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button
                variant="ghost"
                asChild
                className="justify-start gap-2 text-left text-sm"
              >
                <a href="/legal/privacy" className="flex items-center gap-2">
                  Privacy Policy
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button
                variant="ghost"
                asChild
                className="justify-start gap-2 text-left text-sm"
              >
                <a href="/legal/terms" className="flex items-center gap-2">
                  Terms of Service
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button
                variant="ghost"
                asChild
                className="justify-start gap-2 text-left text-sm"
              >
                <a href="/legal/refund" className="flex items-center gap-2">
                  Refund Policy
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
              <Button
                variant="ghost"
                asChild
                className="justify-start gap-2 text-left text-sm"
              >
                <Link
                  to="/settings/system-check"
                  className="flex items-center gap-2"
                >
                  System Check
                  <ExternalLink className="h-3 w-3" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                asChild
                className="justify-start gap-2 text-left text-sm"
              >
                <a
                  href="/settings/system-check-pro"
                  className="flex items-center gap-2"
                >
                  System Check Pro
                  <ExternalLink className="h-3 w-3" />
                </a>
              </Button>
            </div>
            <div className="rounded bg-muted p-3 text-xs text-muted-foreground space-y-1">
              <div>
                Version: {buildCommit}
                {buildTime ? ` • ${buildTime}` : ""}
              </div>
              <div>
                Stripe mode:{" "}
                {stripeMode === "live"
                  ? "Live"
                  : stripeMode === "test"
                    ? "Test"
                    : stripeMode === "custom"
                      ? "Custom key"
                      : "Missing"}
              </div>
              <div>Publishable key suffix: {publishableKeySuffix || "n/a"}</div>
              {showBuildInfo ? (
                <div>
                  Build {buildHash}
                  {buildTimestamp
                    ? ` • ${new Date(buildTimestamp).toLocaleString()}`
                    : ""}
                </div>
              ) : null}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              support@mybodyscanapp.com
            </p>
          </CardContent>
        </Card>

        <Dialog
          open={deleteDialogOpen}
          onOpenChange={(open) =>
            open
              ? setDeleteStep((prev) => (prev === 0 ? 1 : prev))
              : handleCloseDelete()
          }
        >
          <DialogContent>
            {deleteStep === 1 ? (
              <>
                <DialogHeader>
                  <DialogTitle>Confirm delete</DialogTitle>
                  <DialogDescription>
                    Type <span className="font-semibold">DELETE</span> to
                    continue. This starts the permanent removal process.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  autoFocus
                  value={deleteConfirmInput}
                  onChange={(event) =>
                    setDeleteConfirmInput(event.target.value)
                  }
                  placeholder="Type DELETE"
                  aria-label="Type DELETE to confirm"
                />
                <DialogFooter>
                  <Button variant="outline" onClick={handleCloseDelete}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteStep(2)}
                    disabled={!canAdvanceDelete}
                  >
                    Continue
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>Final confirmation</DialogTitle>
                  <DialogDescription>
                    This will revoke access, delete scans, and erase uploads
                    immediately. You cannot undo this action.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="outline" onClick={handleCloseDelete}>
                    Cancel
                  </Button>
                  <DemoWriteButton
                    variant="destructive"
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount}
                  >
                    {deletingAccount ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
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
