import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import {
  collection,
  query,
  orderBy,
  limit as limitFn,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuthUser } from "@/lib/auth";
import { extractScanMetrics } from "@/lib/scans";
import { summarizeScanMetrics } from "@/lib/scanDisplay";
import { useDemoMode } from "@/components/DemoModeProvider";
import { demoToast } from "@/lib/demoToast";
import { isDemo } from "@/lib/demoFlag";
import { demoLatestScan } from "@/lib/demoDataset";
import { scanStatusLabel } from "@/lib/scanStatus";
import { useUnits } from "@/hooks/useUnits";

type LastScan = {
  id: string;
  createdAt: Date | null;
  status: string;
  raw: any;
};

function toDateOrNull(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value?.toDate === "function") {
    try {
      const date = value.toDate();
      return Number.isFinite(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }
  if (typeof value?.seconds === "number") {
    return new Date(value.seconds * 1000);
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function buildDemoLastScan(): LastScan {
  return {
    id: demoLatestScan.id,
    createdAt: demoLatestScan.completedAt?.toDate
      ? demoLatestScan.completedAt.toDate()
      : new Date(),
    status: demoLatestScan.status,
    raw: demoLatestScan,
  };
}

function scanSortMillis(scan: LastScan): number {
  const raw = scan.raw ?? {};
  const completedAt = toDateOrNull(raw?.completedAt);
  const updatedAt = toDateOrNull(raw?.updatedAt);
  const createdAt = scan.createdAt ?? toDateOrNull(raw?.createdAt);
  return (
    completedAt?.getTime() ?? updatedAt?.getTime() ?? createdAt?.getTime() ?? 0
  );
}

const Home = () => {
  const { user } = useAuthUser();
  const navigate = useNavigate();
  const demo = useDemoMode();
  const { units } = useUnits();
  const onboardingStatus = useOnboardingStatus();
  const initialDemoScan = isDemo() ? buildDemoLastScan() : null;
  const [recentScans, setRecentScans] = useState<LastScan[]>(
    initialDemoScan ? [initialDemoScan] : []
  );
  const [statusTick, bumpStatusTick] = useState(0);
  const loggedOnce = useRef(false);

  const sortedScans = useMemo(() => {
    if (recentScans.length <= 1) {
      return recentScans;
    }
    return [...recentScans].sort(
      (a, b) => scanSortMillis(b) - scanSortMillis(a)
    );
  }, [recentScans]);

  const latestAttempt = sortedScans[0] ?? null;

  const lastScan = useMemo<LastScan | null>(() => {
    if (!sortedScans.length) return null;
    for (const scan of sortedScans) {
      const meta = scanStatusLabel(
        scan.status,
        scan.raw?.updatedAt ?? scan.raw?.completedAt ?? scan.raw?.createdAt
      );
      if (meta.showMetrics) {
        return scan;
      }
    }
    return sortedScans[0] ?? null;
  }, [sortedScans, statusTick]);

  const metrics = lastScan ? extractScanMetrics(lastScan.raw) : null;
  const summary = summarizeScanMetrics(metrics, units);
  const statusMeta = lastScan
    ? scanStatusLabel(
        lastScan.status,
        lastScan.raw?.updatedAt ??
          lastScan.raw?.completedAt ??
          lastScan.raw?.createdAt
      )
    : null;
  const latestStatusMeta = latestAttempt
    ? scanStatusLabel(
        latestAttempt.status,
        latestAttempt.raw?.updatedAt ??
          latestAttempt.raw?.completedAt ??
          latestAttempt.raw?.createdAt
      )
    : null;
  const latestAttemptIsDisplayed = Boolean(
    lastScan && latestAttempt && lastScan.id === latestAttempt.id
  );
  const showLatestErrorBanner = latestStatusMeta?.canonical === "error";
  const showLatestStuckNotice =
    !showLatestErrorBanner &&
    latestStatusMeta?.stale &&
    !latestStatusMeta?.showMetrics;
  const latestAttemptTimestamp = latestAttempt?.createdAt
    ? latestAttempt.createdAt.toLocaleString()
    : null;
  const done = statusMeta?.showMetrics ?? false;
  const created = lastScan?.createdAt
    ? lastScan.createdAt.toLocaleDateString()
    : "—";
  const bf =
    summary.bodyFatPercent != null ? summary.bodyFatPercent.toFixed(1) : "—";
  const weight = summary.weightText;
  const bmi = summary.bmiText;
  const showOnboardingNudge =
    !onboardingStatus.loading && !onboardingStatus.personalizationCompleted;
  const nudgeDescription = onboardingStatus.hasAnyOnboardingData
    ? "Pick up where you left off to unlock personalized scans and workouts."
    : "Share your goals once to unlock personalized scans and workouts.";
  const onboardingCtaTarget = useMemo(
    () => `/onboarding?returnTo=${encodeURIComponent("/home")}`,
    []
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setInterval(() => {
      bumpStatusTick((tick) => tick + 1);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [bumpStatusTick]);

  useEffect(() => {
    if (demo && !user) {
      const demoScan = buildDemoLastScan();
      setRecentScans([demoScan]);
      return;
    }
    if (!user?.uid) {
      setRecentScans([]);
      return;
    }
    const uid = user.uid;

    const q = query(
      collection(db, "users", uid, "scans"),
      orderBy("updatedAt", "desc"),
      limitFn(5)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        if (snap.empty) {
          setRecentScans([]);
          return;
        }
        const mapped = snap.docs.map((docSnap) => {
          const data: any = docSnap.data();
          return {
            id: docSnap.id,
            createdAt: toDateOrNull(data?.createdAt),
            status: data?.status ?? "unknown",
            raw: data,
          } satisfies LastScan;
        });
        if (!loggedOnce.current && mapped.length) {
          console.log("Home lastScan:", mapped[0]?.raw);
          loggedOnce.current = true;
        }
        setRecentScans(mapped);
      },
      (err) => {
        console.error("Home last scan error", err);
        if ((err as any)?.code === "permission-denied") {
          toast({ title: "Permission denied—please sign in again" });
          navigate("/auth", { replace: true });
        }
      }
    );

    return () => unsub();
  }, [user, demo, navigate]);

  const renderStartButton = (
    props: {
      variant?: "default" | "secondary" | "outline";
      className?: string;
    } = {}
  ) => {
    if (!demo || user) {
      return (
        <Button
          variant={props.variant}
          className={props.className}
          onClick={() => navigate("/scan/new")}
        >
          Start a Scan
        </Button>
      );
    }
    const spanClass = props.className
      ? `inline-flex ${props.className}`
      : "inline-flex";
    const buttonClass = props.className
      ? `${props.className} pointer-events-none`
      : "pointer-events-none";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={spanClass} onClick={() => demoToast()}>
            <Button variant={props.variant} disabled className={buttonClass}>
              Start a Scan
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Sign up to use this feature</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <main className="min-h-screen p-6 max-w-md mx-auto">
      <Seo
        title="Home – MyBodyScan"
        description="Your latest body scan and quick actions."
        canonical={window.location.href}
      />
      <div className="mb-4 flex justify-center">
        <Card className="w-40">
          <CardContent className="p-4 text-center">
            <img
              src="/logo.svg"
              alt="MyBodyScan Logo"
              className="mx-auto h-10 w-auto max-w-full object-contain"
            />
          </CardContent>
        </Card>
      </div>
      <header className="mb-6 text-center">
        <h1 className="text-3xl font-semibold">MyBodyScan</h1>
      </header>
      <section className="space-y-4">
        {showOnboardingNudge && (
          <Card className="border-primary/40 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">Complete your profile</CardTitle>
              <CardDescription>{nudgeDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="sm" onClick={() => navigate(onboardingCtaTarget)}>
                Finish setup
              </Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Last scan</CardTitle>
            <CardDescription>
              The most recent result for your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {showLatestErrorBanner && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <p className="text-sm font-semibold text-destructive">
                  Last scan failed
                  {latestAttempt?.raw?.errorReason
                    ? ` (${latestAttempt.raw.errorReason})`
                    : latestAttempt?.raw?.lastStep
                      ? ` (${latestAttempt.raw.lastStep})`
                      : ""}
                </p>
                <p className="text-xs text-destructive/80">
                  {latestAttempt?.raw?.errorMessage ||
                    "Start a new scan to try again."}
                </p>
                <div className="mt-2">
                  {renderStartButton({ className: "w-full" })}
                </div>
              </div>
            )}
            {showLatestStuckNotice && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="text-sm font-semibold">Scan appears stuck</p>
                <p>
                  {latestAttemptIsDisplayed
                    ? "We haven't received the final result. Start a new scan to continue."
                    : `Your most recent scan${
                        latestAttemptTimestamp
                          ? ` from ${latestAttemptTimestamp}`
                          : ""
                      } looks stuck. Showing the last completed result below.`}
                </p>
              </div>
            )}
            {!lastScan && (
              <div>
                <p className="text-muted-foreground">
                  No scans yet — Start a Scan to see your first result.
                </p>
              </div>
            )}
            {lastScan && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{created}</p>
                {done ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-2xl font-semibold">{bf}</p>
                      <p className="text-xs text-muted-foreground">Body Fat</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{weight}</p>
                      <p className="text-xs text-muted-foreground">Weight</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{bmi}</p>
                      <p className="text-xs text-muted-foreground">BMI</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Badge variant={statusMeta?.badgeVariant ?? "secondary"}>
                      {statusMeta?.label ?? "Processing…"}
                    </Badge>
                    <p className="text-xs text-muted-foreground">
                      {statusMeta?.helperText ?? "Check History for progress."}
                    </p>
                    {statusMeta?.recommendRescan && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate("/scan")}
                      >
                        Rescan
                      </Button>
                    )}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  {renderStartButton()}
                  <Button
                    variant="secondary"
                    onClick={() => navigate("/history")}
                  >
                    View History
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-3">
          {renderStartButton({ className: "w-full" })}
          <a
            href={onboardingCtaTarget}
            className="block text-center text-sm text-slate-500 hover:text-slate-700 mt-2"
          >
            Personalize results (1 min)
          </a>
          <Button variant="secondary" onClick={() => navigate("/history")}>
            History
          </Button>
          <Button variant="outline" onClick={() => navigate("/plans")}>
            Plans
          </Button>
          <Button variant="outline" onClick={() => navigate("/settings")}>
            Settings
          </Button>
        </div>
      </section>
    </main>
  );
};

export default Home;
