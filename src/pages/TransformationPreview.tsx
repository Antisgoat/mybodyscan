import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Clock, Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Seo } from "@/components/Seo";
import { useAuthUser } from "@/auth/mbs-auth";
import { useClaims } from "@/lib/claims";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";
import { useLatestScanForUser } from "@/hooks/useLatestScanForUser";
import { subscribeTransformationPreview } from "@/lib/transformationPreview";
import { buildScanResultViewModel } from "@/lib/scanResultViewModel";
import { useUserProfile } from "@/hooks/useUserProfile";
import { TRANSFORMATION_PREVIEW_ENTRY_ENABLED } from "@/lib/flags";

export default function TransformationPreviewPage() {
  const { scanId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthUser();
  const { claims } = useClaims();
  const { entitlements } = useEntitlements();
  const { scan, loading: scanLoading } = useLatestScanForUser(scanId);
  const { profile, plan } = useUserProfile();
  const pro = hasPro(entitlements);
  const internalAccess = Boolean(
    import.meta.env.DEV ||
      (claims as any)?.admin ||
      (claims as any)?.dev ||
      (claims as any)?.staff ||
      (claims as any)?.unlimited ||
      (claims as any)?.unlimitedCredits
  );
  const paidScanPreviewEligible = Boolean((scan as any)?.charged);
  const previewEligible = pro || paidScanPreviewEligible;
  const [state, setState] = useState<any>(null);
  const [loadingState, setLoadingState] = useState(true);

  useEffect(() => {
    if (!user?.uid || !scanId) {
      setLoadingState(false);
      return;
    }
    const unsub = subscribeTransformationPreview(
      user.uid,
      scanId,
      (next) => {
        setState(next);
        setLoadingState(false);
      },
      () => setLoadingState(false)
    );
    return () => unsub();
  }, [user?.uid, scanId]);

  const vm = useMemo(
    () =>
      scan
        ? buildScanResultViewModel({ scan: scan as any, profile, plan })
        : null,
    [scan, profile, plan]
  );

  if (!TRANSFORMATION_PREVIEW_ENTRY_ENABLED && !internalAccess) {
    return (
      <main className="min-h-screen p-4 md:p-6 max-w-2xl mx-auto space-y-4">
        <Seo
          title="Transformation Preview – MyBodyScan"
          description="Transformation Preview status"
          canonical={window.location.href}
        />
        <Card>
          <CardHeader>
            <CardTitle>Transformation Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Transformation Preview is not available for this scan yet.</p>
            <Button onClick={() => navigate(`/results/${scanId}`)}>
              Back to results
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const eligibility = (() => {
    if (scanLoading || loadingState) {
      return {
        label: "Checking",
        copy: "Checking scan and preview eligibility…",
      };
    }
    if (!previewEligible) {
      return {
        label: "Locked",
        copy: "Transformation Preview is included with eligible paid scans and premium memberships.",
      };
    }
    if (!vm?.isValidResult) {
      return {
        label: "Scan not ready",
        copy: "A completed scan is required before Transformation Preview can be prepared.",
      };
    }
    if (vm.plan.setupNeeded) {
      return {
        label: "Plan setup needed",
        copy: "Complete your plan setup so the preview can reflect your training target.",
      };
    }
    if (state?.status === "ready" && state?.imageUrl) {
      return {
        label: "Ready",
        copy: "Your Transformation Preview is ready.",
      };
    }
    return {
      label: "Not ready",
      copy: "Your scan is eligible. We’ll show your preview here when it is ready.",
    };
  })();

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Seo
        title="Transformation Preview – MyBodyScan"
        description="Premium transformation projection status"
        canonical={window.location.href}
      />
      <Card className="bg-gradient-to-b from-zinc-900 to-black border-zinc-800 text-zinc-100">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-xl flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Transformation
              Preview
            </CardTitle>
            <Badge variant={previewEligible ? "default" : "secondary"}>
              {eligibility.label}
            </Badge>
          </div>
          <p className="text-xs text-zinc-400">
            See a realistic motivational visualization of your goal physique
            once your scan and plan are ready.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {state?.status === "ready" &&
          state?.imageUrl &&
          TRANSFORMATION_PREVIEW_ENTRY_ENABLED ? (
            <img
              src={state.imageUrl}
              alt="Transformation preview"
              className="w-full rounded-xl border border-zinc-700 object-cover"
            />
          ) : (
            <Card className="border-zinc-700 bg-zinc-900/50">
              <CardContent className="pt-6 space-y-3 text-sm text-zinc-300">
                <div className="flex gap-3 items-start">
                  {previewEligible ? (
                    <Clock className="h-4 w-4 mt-0.5" />
                  ) : (
                    <Lock className="h-4 w-4 mt-0.5" />
                  )}
                  <div className="space-y-1">
                    <p className="font-medium text-zinc-100">
                      {eligibility.label}
                    </p>
                    <p>{eligibility.copy}</p>
                  </div>
                </div>
                {internalAccess && state?.status ? (
                  <div className="rounded-lg border border-zinc-700 p-3 text-xs text-zinc-400">
                    Preview document status: {String(state.status)}.
                  </div>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => navigate(`/results/${scanId}`)}>
                    Back to results
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => navigate("/programs")}
                  >
                    Review plan
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
          <p className="text-xs text-zinc-500">
            Motivational wellness visualization only. Not a medical prediction.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
