import { useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuthUser } from "@/lib/auth";
import { db } from "@/lib/firebase";
import { fnUrl } from "@/lib/env";
import { nutritionSearch } from "@/lib/api";
import { coachPlanDoc } from "@/lib/db/coachPaths";

interface HealthResponse {
  status: string;
  time: string;
  hasOpenAIKey: boolean;
  appCheckSoft: boolean;
  nutritionCallable: boolean;
  coachDocPath: string;
  scanProvider: "openai-vision" | "mock";
  demoCreditsPolicy: string;
}

type CheckState = "idle" | "loading" | "pass" | "fail";

interface CheckStatus {
  state: CheckState;
  message?: string;
  data?: unknown;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function statusVariant(state: CheckState) {
  switch (state) {
    case "pass":
      return "default" as const;
    case "fail":
      return "destructive" as const;
    case "loading":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

function stateLabel(state: CheckState): string {
  switch (state) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "loading":
      return "Running…";
    default:
      return "Idle";
  }
}

export default function SystemCheck() {
  const { user, loading: authLoading } = useAuthUser();
  const [healthStatus, setHealthStatus] = useState<CheckStatus>({ state: "idle" });
  const [healthPayload, setHealthPayload] = useState<HealthResponse | null>(null);
  const [nutritionStatus, setNutritionStatus] = useState<CheckStatus>({ state: "idle" });
  const [coachStatus, setCoachStatus] = useState<CheckStatus>({ state: "idle" });
  const [creditsStatus, setCreditsStatus] = useState<CheckStatus>({ state: "idle" });

  const authStatus: CheckStatus = useMemo(() => {
    if (authLoading) {
      return { state: "loading", message: "Checking auth state…" };
    }
    if (!user) {
      return { state: "fail", message: "Not signed in" };
    }
    const googleLinked = user.providerData?.some((provider) => provider.providerId === "google.com");
    if (googleLinked) {
      return { state: "pass", message: user.email ? `Google linked (${user.email})` : "Google provider linked" };
    }
    return { state: "fail", message: "Sign in with Google to verify provider availability" };
  }, [authLoading, user]);

  const runHealthCheck = async () => {
    setHealthStatus({ state: "loading", message: "Fetching /health" });
    setHealthPayload(null);
    const target = fnUrl("/health") || "/api/health";
    try {
      const response = await fetch(target, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error(`status_${response.status}`);
      }
      const data = (await response.json()) as HealthResponse;
      setHealthPayload(data);
      setHealthStatus({ state: "pass", message: "Health endpoint reachable" });
    } catch (error) {
      setHealthStatus({ state: "fail", message: describeError(error) });
    }
  };

  const runNutritionCheck = async () => {
    setNutritionStatus({ state: "loading", message: "Searching for chicken…" });
    try {
      const payload = await nutritionSearch("chicken");
      const items = Array.isArray(payload?.items) ? payload.items.slice(0, 3) : [];
      if (!items.length) {
        setNutritionStatus({ state: "fail", message: "No results returned" });
        return;
      }
      setNutritionStatus({ state: "pass", message: `${items.length} items received`, data: items });
    } catch (error) {
      setNutritionStatus({ state: "fail", message: describeError(error) });
    }
  };

  const runCoachCheck = async () => {
    if (!user) {
      setCoachStatus({ state: "fail", message: "Sign in to load coach plan" });
      return;
    }
    setCoachStatus({ state: "loading", message: "Loading coach plan…" });
    try {
      const ref = coachPlanDoc(user.uid);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        setCoachStatus({ state: "pass", message: "No plan yet" });
        return;
      }
      const data = snapshot.data();
      setCoachStatus({ state: "pass", message: "Plan loaded", data });
    } catch (error) {
      setCoachStatus({ state: "fail", message: describeError(error) });
    }
  };

  const runCreditsCheck = async () => {
    if (!user) {
      setCreditsStatus({ state: "fail", message: "Sign in to verify credits" });
      return;
    }
    setCreditsStatus({ state: "loading", message: "Checking credits…" });
    try {
      const profileRef = doc(db, "users", user.uid, "profile");
      const snapshot = await getDoc(profileRef);
      const creditsRaw = snapshot.exists() ? (snapshot.data() as any)?.credits : undefined;
      const credits = typeof creditsRaw === "number" ? creditsRaw : undefined;
      if (credits !== undefined && credits >= 2) {
        setCreditsStatus({ state: "pass", message: `Credits available: ${credits}`, data: credits });
        return;
      }
      setCreditsStatus({
        state: "fail",
        message: `Credits below threshold (${credits ?? "none"})`,
        data: credits ?? null,
      });
    } catch (error) {
      setCreditsStatus({ state: "fail", message: describeError(error) });
    }
  };

  const renderStatus = (status: CheckStatus) => (
    <div className="flex items-center gap-2">
      <Badge variant={statusVariant(status.state)}>{stateLabel(status.state)}</Badge>
      {status.message ? <span className="text-sm text-muted-foreground">{status.message}</span> : null}
    </div>
  );

  const nutritionItems = Array.isArray(nutritionStatus.data) ? (nutritionStatus.data as any[]) : [];

  return (
    <div className="max-w-4xl mx-auto w-full space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">System Check</h1>
        <p className="text-sm text-muted-foreground">
          Validate environment wiring for auth, App Check, nutrition search, coach plan, and demo credits. Use these tools after
          deploys or when updating secrets.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Auth & Google provider</CardTitle>
          {renderStatus(authStatus)}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Current user: {user?.email || user?.uid || "none"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>/health endpoint</CardTitle>
          {renderStatus(healthStatus)}
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runHealthCheck} disabled={healthStatus.state === "loading"}>
            {healthStatus.state === "loading" ? "Checking…" : "Call /health"}
          </Button>
          {healthPayload ? (
            <pre className="bg-slate-950/90 text-slate-100 text-xs rounded-md p-4 overflow-x-auto">
              {JSON.stringify(healthPayload, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Nutrition search</CardTitle>
          {renderStatus(nutritionStatus)}
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runNutritionCheck} disabled={nutritionStatus.state === "loading"}>
            {nutritionStatus.state === "loading" ? "Searching…" : "Test nutrition lookup"}
          </Button>
          {nutritionItems.length ? (
            <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
              {nutritionItems.map((item, index) => (
                <li key={item?.id ?? index}>
                  <span className="font-medium text-foreground">{item?.name ?? "Item"}</span>
                  {item?.brand ? <span className="text-muted-foreground"> — {item.brand}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Coach plan document</CardTitle>
          {renderStatus(coachStatus)}
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runCoachCheck} disabled={coachStatus.state === "loading"}>
            {coachStatus.state === "loading" ? "Loading…" : "Fetch coach plan"}
          </Button>
          {coachStatus.data ? (
            <pre className="bg-slate-950/90 text-slate-100 text-xs rounded-md p-4 overflow-x-auto">
              {JSON.stringify(coachStatus.data, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Demo credits</CardTitle>
          {renderStatus(creditsStatus)}
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={runCreditsCheck} disabled={creditsStatus.state === "loading"}>
            {creditsStatus.state === "loading" ? "Checking…" : "Check demo credits"}
          </Button>
          {typeof creditsStatus.data === "number" ? (
            <p className="text-sm text-muted-foreground">Credits: {creditsStatus.data}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
