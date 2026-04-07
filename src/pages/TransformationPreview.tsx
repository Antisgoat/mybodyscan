import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Download, Lock, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Seo } from "@/components/Seo";
import { useAuthUser } from "@/auth/mbs-auth";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";
import { useLatestScanForUser } from "@/hooks/useLatestScanForUser";
import {
  requestTransformationPreview,
  subscribeTransformationPreview,
  type TransformationPreviewGoal,
} from "@/lib/transformationPreview";
import { toast } from "@/hooks/use-toast";

const GOAL_TO_COPY: Record<TransformationPreviewGoal, string> = {
  lose_fat: "Reduce fat while preserving muscle.",
  gain_muscle: "Build lean mass while keeping waist controlled.",
  recomp: "Trade fat mass for lean tissue gradually.",
  maintain: "Maintain composition and improve definition.",
  performance: "Build a stronger athletic shape for performance.",
};

export default function TransformationPreviewPage() {
  const { scanId = "" } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthUser();
  const { entitlements } = useEntitlements();
  const { scan } = useLatestScanForUser(scanId);
  const pro = hasPro(entitlements);
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!user?.uid || !scanId) {
      setLoading(false);
      return;
    }
    const unsub = subscribeTransformationPreview(
      user.uid,
      scanId,
      (next) => {
        setState(next);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user?.uid, scanId]);

  const goal = useMemo<TransformationPreviewGoal>(() => {
    const raw = String((scan as any)?.goalType || (scan as any)?.goal || "recomp").toLowerCase();
    if (raw.includes("lose")) return "lose_fat";
    if (raw.includes("gain")) return "gain_muscle";
    if (raw.includes("maintain")) return "maintain";
    if (raw.includes("perform")) return "performance";
    return "recomp";
  }, [scan]);

  const onRequest = async () => {
    if (!user?.uid || !scanId) return;
    setRequesting(true);
    try {
      await requestTransformationPreview({
        uid: user.uid,
        scanId,
        goal,
        timelineWeeks: Number((scan as any)?.timelineWeeks) || 12,
        planSummary: (scan as any)?.planMarkdown || null,
      });
      toast({ title: "Transformation Preview queued" });
    } catch (error: any) {
      toast({ title: "Unable to queue preview", description: error?.message, variant: "destructive" });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <Seo title="Transformation Preview – MyBodyScan" description="Premium transformation projection" canonical={window.location.href} />
      <Card className="bg-gradient-to-b from-zinc-900 to-black border-zinc-800 text-zinc-100">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Transformation Preview</CardTitle>
            <Badge variant={pro ? "default" : "secondary"}>{pro ? "Premium" : "Locked"}</Badge>
          </div>
          <p className="text-xs text-zinc-400">Realistic visual projection tied to your current plan and timeline.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!pro ? (
            <Card className="border-zinc-700 bg-zinc-900/60"><CardContent className="pt-6 space-y-3 text-sm text-zinc-300"><div className="flex gap-2 items-start"><Lock className="h-4 w-4 mt-0.5" />Premium members unlock Transformation Preview immediately after each scan.</div><Button className="w-full" onClick={() => navigate("/plans")}>Upgrade to Premium</Button></CardContent></Card>
          ) : state?.status === "ready" && state?.imageUrl ? (
            <div className="space-y-3">
              <img src={state.imageUrl} alt="Transformation preview" className="w-full rounded-xl border border-zinc-700 object-cover" />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary"><Download className="h-4 w-4 mr-1" />Download</Button>
                <Button variant="secondary"><Share2 className="h-4 w-4 mr-1" />Share</Button>
              </div>
            </div>
          ) : (
            <Card className="border-zinc-700 bg-zinc-900/40"><CardContent className="pt-6 space-y-3 text-sm text-zinc-300">
              <p>{GOAL_TO_COPY[goal]}</p>
              <p className="text-zinc-400">{loading ? "Loading preview status..." : state?.status === "queued" || state?.status === "processing" ? "Your preview is being generated. Keep this plan for the most realistic progression." : "No preview generated yet for this scan."}</p>
              <Button onClick={onRequest} disabled={requesting || state?.status === "queued" || state?.status === "processing"} className="w-full">{requesting ? "Queuing..." : "Generate Transformation Preview"}</Button>
            </CardContent></Card>
          )}
          <p className="text-xs text-zinc-500">Transformation Preview is a motivational projection based on your scan and plan. Results vary by adherence, recovery, and consistency.</p>
        </CardContent>
      </Card>
    </main>
  );
}
