import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Clock, Lock, Sparkles, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/Seo";
import { useAuthUser } from "@/auth/mbs-auth";
import { useClaims } from "@/lib/claims";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";
import { useLatestScanForUser } from "@/hooks/useLatestScanForUser";
import {
  requestTransformationPreview,
  subscribeTransformationPreview,
  TRANSFORMATION_PREVIEW_PROMPT_VERSION,
  type TransformationPreviewGoal,
  type TransformationPreviewDocument,
} from "@/lib/transformationPreview";
import { buildScanResultViewModel } from "@/lib/scanResultViewModel";
import { useUserProfile } from "@/hooks/useUserProfile";
import { TRANSFORMATION_PREVIEW_ENTRY_ENABLED } from "@/lib/flags";
import { toast } from "@/hooks/use-toast";
import { useTransformationPreviewImage } from "@/hooks/useTransformationPreviewImage";
import { isTransformationPreviewStale } from "@/lib/transformationPreviewState";

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
  const canAccessPreview = pro;
  const previewScope = `${user?.uid ?? ""}/${scanId}`;
  const [document, setDocument] = useState<{
    scope: string;
    value: TransformationPreviewDocument | null;
  } | null>(null);
  const state = document?.scope === previewScope ? document.value : null;
  const [loadingState, setLoadingState] = useState(true);
  const [consent, setConsent] = useState(false);
  const [goal, setGoal] = useState<TransformationPreviewGoal>("recomp");
  const [timelineWeeks, setTimelineWeeks] = useState(12);
  const [requesting, setRequesting] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const previewInProgress =
    state?.status === "processing" || state?.status === "queued";
  const generationStale = isTransformationPreviewStale(state, clock);
  useEffect(() => {
    if (!previewInProgress) return;
    setClock(Date.now());
    const timer = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [previewInProgress, previewScope]);
  const {
    url: previewUrl,
    status: previewImageStatus,
    retry: retryPreviewImage,
    onImageError,
  } = useTransformationPreviewImage(
    canAccessPreview ? (state?.storagePath ?? null) : null
  );

  useEffect(() => {
    if (!user?.uid || !scanId || !canAccessPreview) {
      setDocument(null);
      setLoadingState(false);
      return;
    }
    setLoadingState(true);
    let active = true;
    const unsub = subscribeTransformationPreview(
      user.uid,
      scanId,
      (next) => {
        if (!active) return;
        setDocument({ scope: previewScope, value: next });
        setLoadingState(false);
      },
      () => {
        if (active) setLoadingState(false);
      }
    );
    return () => {
      active = false;
      unsub();
    };
  }, [user?.uid, scanId, canAccessPreview, previewScope]);

  useEffect(() => {
    setConsent(false);
  }, [previewScope]);

  useEffect(() => {
    if (!state) return;
    setGoal(state.goal);
    setTimelineWeeks(state.timelineWeeks);
  }, [state]);

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
    if (!pro) {
      return {
        label: "Locked",
        copy: "Transformation Preview requires an active monthly or yearly plan.",
      };
    }
    if (!vm?.isValidResult) {
      return {
        label: "Scan not ready",
        copy: "A completed scan is required before Transformation Preview can be prepared.",
      };
    }
    const age = Number((profile as any)?.age);
    if (!Number.isFinite(age) || age < 18) {
      return {
        label: "Profile age needed",
        copy: "Transformation Preview is available only to adults. Add your age in Settings to continue.",
      };
    }
    if (canAccessPreview && state?.storagePath) {
      return {
        label:
          state?.status === "processing" || state?.status === "queued"
            ? generationStale
              ? "Update interrupted"
              : "Updating"
            : state?.status === "failed"
              ? "Previous preview"
              : "Ready",
        copy:
          state?.status === "failed"
            ? "Your last completed preview is still available. A newer attempt did not finish."
            : "Your Transformation Preview is ready.",
      };
    }
    if (generationStale) {
      return {
        label: "Creation interrupted",
        copy: "This attempt is taking longer than expected. You can explicitly retry below; your server-side limits still apply.",
      };
    }
    if (previewInProgress) {
      return {
        label: "Creating",
        copy: "Your private preview is being created. This can take a couple of minutes.",
      };
    }
    if (state?.status === "failed") {
      return {
        label: "Try again",
        copy: "The previous attempt did not finish. You can safely try again.",
      };
    }
    return {
      label: "Ready to create",
      copy: "Choose a goal and explicitly consent before creating your private preview.",
    };
  })();

  const age = Number((profile as any)?.age);
  const adult = Number.isFinite(age) && age >= 18;
  const canRequest =
    canAccessPreview &&
    Boolean(vm?.isValidResult) &&
    adult &&
    consent &&
    !requesting &&
    (!previewInProgress || generationStale);
  const improvedPreviewAvailable =
    Boolean(state?.storagePath) &&
    (state?.promptVersion !== TRANSFORMATION_PREVIEW_PROMPT_VERSION ||
      state?.status === "failed");
  const canRetryGeneration = state?.status === "failed" || generationStale;
  const showGenerationUpdate =
    improvedPreviewAvailable ||
    (Boolean(state?.storagePath) && generationStale);

  const handleRequest = async () => {
    if (!canRequest) return;
    setRequesting(true);
    try {
      await requestTransformationPreview({
        scanId,
        goal,
        timelineWeeks,
        consent: true,
      });
      toast({
        title: "Preview requested",
        description: "Keep this page open or return in a few minutes.",
      });
    } catch (error: any) {
      toast({
        title: "Unable to create preview",
        description:
          error?.message || "Please check eligibility and try again.",
        variant: "destructive",
      });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Seo
        title="Transformation Preview – MyBodyScan"
        description="Private motivational fitness illustration"
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
            A realistic motivational visualization based on your scan, goal, and
            plan.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {canAccessPreview &&
          state?.storagePath &&
          TRANSFORMATION_PREVIEW_ENTRY_ENABLED ? (
            previewUrl ? (
              <div className="space-y-3">
                <img
                  src={previewUrl}
                  onError={onImageError}
                  alt="Illustrative future-goal fitness visualization"
                  className="aspect-[2/3] w-full rounded-xl border border-zinc-700 bg-zinc-950 object-cover object-center"
                />
                <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
                  This computer-generated image is illustrative—not a forecast
                  or guarantee. Real outcomes and appearance vary.
                </p>
                {state?.status === "processing" ||
                state?.status === "queued" ? (
                  <p className="rounded-lg border border-cyan-400/20 bg-cyan-400/10 p-3 text-xs text-cyan-100">
                    {generationStale
                      ? "The update appears interrupted. Your previous image is still available; you can choose to retry below."
                      : "Creating your update. Your previous image remains available while it finishes."}
                  </p>
                ) : state?.status === "failed" ? (
                  <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
                    The update did not finish, so we kept your last completed
                    preview. You can retry without losing it.
                  </p>
                ) : null}
                {showGenerationUpdate ? (
                  <div className="space-y-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-4">
                    <div className="space-y-1">
                      <p className="font-semibold text-cyan-50">
                        {canRetryGeneration
                          ? "Your update did not finish"
                          : "A clearer goal visualization is available"}
                      </p>
                      <p className="text-xs leading-5 text-cyan-100/80">
                        {canRetryGeneration
                          ? "Your last completed image is safe. Retrying creation uses a generation allowance if it succeeds; retrying an image download does not."
                          : "The updated version keeps your identity and natural proportions while making the selected fitness direction easier to see. It also corrects sideways image output."}
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id="preview-refresh-consent"
                        checked={consent}
                        onCheckedChange={(checked) =>
                          setConsent(checked === true)
                        }
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor="preview-refresh-consent"
                        className="text-xs font-normal leading-5 text-cyan-50/90"
                      >
                        I consent to resend my front scan photo and saved goal
                        to create the updated private preview.
                      </Label>
                    </div>
                    <Button
                      className="w-full"
                      disabled={!canRequest}
                      onClick={handleRequest}
                    >
                      {requesting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating updated preview…
                        </>
                      ) : (
                        <>
                          <Sparkles className="mr-2 h-4 w-4" />
                          {canRetryGeneration
                            ? "Retry preview creation"
                            : "Create updated preview"}
                        </>
                      )}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : previewImageStatus === "error" ? (
              <div className="space-y-3 rounded-xl border border-zinc-700 p-4">
                <p role="alert" className="text-sm text-zinc-200">
                  Your preview could not be loaded. The saved image has not been
                  lost.
                </p>
                <p className="text-xs text-zinc-400">
                  Retry the image download without creating a new preview or
                  using a generation allowance.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={retryPreviewImage}
                >
                  Retry image download
                </Button>
              </div>
            ) : (
              <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Securely loading
                preview…
              </div>
            )
          ) : (
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
                      {eligibility.label}
                    </p>
                    <p>{eligibility.copy}</p>
                    {canAccessPreview && vm?.isValidResult && !adult ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="mt-2"
                        onClick={() => navigate("/settings")}
                      >
                        Add age in Settings
                      </Button>
                    ) : null}
                  </div>
                </div>
                {internalAccess && state?.status ? (
                  <div className="rounded-lg border border-zinc-700 p-3 text-xs text-zinc-400">
                    Preview document status: {String(state.status)}.
                  </div>
                ) : null}
                {canAccessPreview &&
                  vm?.isValidResult &&
                  adult &&
                  (!previewInProgress || generationStale) && (
                    <div className="space-y-4 rounded-xl border border-zinc-700 bg-black/20 p-4">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="preview-goal">
                            Visualization goal
                          </Label>
                          <select
                            id="preview-goal"
                            value={goal}
                            onChange={(event) =>
                              setGoal(
                                event.target.value as TransformationPreviewGoal
                              )
                            }
                            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                          >
                            <option value="lose_fat">Leaner look</option>
                            <option value="gain_muscle">Build muscle</option>
                            <option value="recomp">Body recomposition</option>
                            <option value="performance">
                              Athletic development
                            </option>
                            <option value="maintain">Maintain</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="preview-timeline">
                            Motivational horizon
                          </Label>
                          <select
                            id="preview-timeline"
                            value={timelineWeeks}
                            onChange={(event) =>
                              setTimelineWeeks(Number(event.target.value))
                            }
                            className="min-h-11 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-100"
                          >
                            <option value={8}>8 weeks</option>
                            <option value={12}>12 weeks</option>
                            <option value={16}>16 weeks</option>
                            <option value={24}>24 weeks</option>
                          </select>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id="preview-consent"
                          checked={consent}
                          onCheckedChange={(checked) =>
                            setConsent(checked === true)
                          }
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor="preview-consent"
                          className="text-xs font-normal leading-relaxed text-zinc-300"
                        >
                          I consent to MyBodyScan sending my front scan photo
                          and selected goal to its contracted image-processing
                          provider to create this one-time image. I understand
                          it is computer-generated, can be inaccurate, and is
                          not a prediction.
                        </Label>
                      </div>
                      <Button
                        className="w-full"
                        disabled={!canRequest}
                        onClick={handleRequest}
                      >
                        {requesting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                            Creating private preview…
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="mr-2 h-4 w-4" /> Create
                            private preview
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                {(state?.status === "processing" ||
                  state?.status === "queued") && (
                  <div className="flex items-center gap-2 rounded-lg border border-zinc-700 p-3 text-xs text-zinc-300">
                    <Loader2 className="h-4 w-4 animate-spin" /> Generation is
                    in progress. Duplicate requests are blocked.
                  </div>
                )}
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
