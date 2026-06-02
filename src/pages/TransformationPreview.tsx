import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Lock, Sparkles, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Seo } from "@/components/Seo";
import { useAuthUser } from "@/auth/mbs-auth";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";
import { useLatestScanForUser } from "@/hooks/useLatestScanForUser";
import { subscribeTransformationPreview } from "@/lib/transformationPreview";
import { buildScanResultViewModel } from "@/lib/scanResultViewModel";
import { useUserProfile } from "@/hooks/useUserProfile";

export default function TransformationPreviewPage() {
  const { scanId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthUser();
  const { entitlements } = useEntitlements();
  const { scan, loading: scanLoading } = useLatestScanForUser(scanId);
  const { profile, plan } = useUserProfile();
  const pro = hasPro(entitlements);
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

  const eligibility = (() => {
    if (!pro)
      return {
        label: "Locked",
        copy: "One paid scan credit will include one Transformation Preview when generation is enabled.",
      };
    if (scanLoading || loadingState)
      return {
        label: "Checking",
        copy: "Checking scan and preview eligibility…",
      };
    if (!vm?.isValidResult)
      return {
        label: "Scan not ready",
        copy: "A trustworthy completed scan is required before Transformation Preview can be generated.",
      };
    if (vm.plan.setupNeeded)
      return {
        label: "Plan setup needed",
        copy: "Complete your plan setup so the preview can reflect your actual training target.",
      };
    if (state?.status === "failed")
      return {
        label: "Not ready",
        copy: "Preview generation is currently disabled while scan reliability is being verified.",
      };
    return {
      label: "Not ready",
      copy: "Transformation Preview is scaffolded, but image generation is intentionally disabled until scan results are trustworthy.",
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
            <Badge variant={pro ? "default" : "secondary"}>
              {eligibility.label}
            </Badge>
          </div>
          <p className="text-xs text-zinc-400">
            See a realistic motivational visualization of your goal physique
            once your scan and plan are ready.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <Card className="border-zinc-700 bg-zinc-900/50">
            <CardContent className="pt-6 space-y-3 text-sm text-zinc-300">
              <div className="flex gap-3 items-start">
                {pro ? (
                  <Clock className="h-4 w-4 mt-0.5" />
                ) : (
                  <Lock className="h-4 w-4 mt-0.5" />
                )}
                <div className="space-y-1">
                  <p className="font-medium text-zinc-100">
                    Preview image generation is not enabled yet.
                  </p>
                  <p>{eligibility.copy}</p>
                </div>
              </div>
              {state?.status ? (
                <div className="rounded-lg border border-zinc-700 p-3 text-xs text-zinc-400">
                  Stored preview status: {String(state.status)}. No image is
                  displayed from this scaffold.
                </div>
              ) : null}
              {vm?.isFailedOrFallback ? (
                <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                  <AlertCircle className="h-4 w-4 shrink-0" /> Resolve the
                  failed scan first; fallback metrics are never eligible.
                </div>
              ) : null}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button onClick={() => navigate(`/results/${scanId}`)}>
                  Back to results
                </Button>
                <Button variant="outline" onClick={() => navigate("/programs")}>
                  Review plan
                </Button>
              </div>
            </CardContent>
          </Card>
          <p className="text-xs text-zinc-500">
            Motivational feature only. No fake before/after image is generated
            or displayed in this pass.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
