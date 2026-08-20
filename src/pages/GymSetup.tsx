import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Dumbbell,
  Loader2,
  Video,
} from "lucide-react";

import { useAuthUser } from "@/auth/mbs-auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { callCallable } from "@/lib/backend/callBackend";
import { db } from "@/lib/firebase";
import { prepareGymPhoto, sampleGymVideo } from "@/lib/gymCapture";
import {
  deriveExerciseEquipment,
  GYM_EQUIPMENT,
  gymProfileEquipment,
  normalizeGymEquipment,
  type GymEquipmentAnalysis,
  type GymEquipmentId,
  type SavedGymProfile,
} from "@/lib/gymEquipment";
import { sanitizeReturnTo } from "@/lib/returnTo";
import { setDoc } from "@/lib/dbWrite";

type CaptureSource = "manual" | "photo" | "video" | "mixed";

const GROUPS = Array.from(new Set(GYM_EQUIPMENT.map((item) => item.group)));

function sourceFor(
  usedAnalysis: boolean,
  mediaKind: "photo" | "video" | null
): CaptureSource {
  if (!usedAnalysis || !mediaKind) return "manual";
  return mediaKind;
}

export default function GymSetup() {
  const { user } = useAuthUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const [selected, setSelected] = useState<Set<GymEquipmentId>>(new Set());
  const [locationName, setLocationName] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState<GymEquipmentAnalysis | null>(null);
  const [mediaKind, setMediaKind] = useState<"photo" | "video" | null>(null);
  const [mediaLabel, setMediaLabel] = useState<string | null>(null);
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));

  useEffect(() => {
    let cancelled = false;
    if (!user?.uid) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }
    void getDoc(doc(db, "users", user.uid, "preferences", "gymEquipment"))
      .then((snapshot) => {
        if (cancelled || !snapshot.exists()) return;
        const data = snapshot.data() as Partial<SavedGymProfile>;
        setSelected(new Set(normalizeGymEquipment(data.inventory)));
        setLocationName(
          typeof data.locationName === "string" ? data.locationName : ""
        );
        setNotes(typeof data.notes === "string" ? data.notes : "");
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  const selectedList = useMemo(
    () =>
      GYM_EQUIPMENT.filter((item) => selected.has(item.id)).map(
        (item) => item.id
      ),
    [selected]
  );

  const toggle = (id: GymEquipmentId, checked: boolean) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const analyzeFrames = async (
    frames: string[],
    kind: "photo" | "video",
    label: string
  ) => {
    setAnalyzing(true);
    setAnalysis(null);
    setMediaKind(kind);
    setMediaLabel(label);
    try {
      const result = await callCallable<
        { frames: string[] },
        GymEquipmentAnalysis & { reviewRequired?: boolean }
      >("analyzeGymEquipment", { frames });
      setAnalysis(result);
      setSelected(
        new Set(
          result.detected
            .filter((item) => item.confidence >= 0.65)
            .map((item) => item.id)
        )
      );
      toast({
        title: "Draft inventory ready",
        description: "Review every selection before saving it to your plan.",
      });
    } catch (error) {
      toast({
        title: "Could not review that capture",
        description:
          error instanceof Error
            ? error.message
            : "Select your equipment manually instead.",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePhotos = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []).slice(0, 6);
    if (!selectedFiles.length) return;
    setAnalyzing(true);
    try {
      const frames = await Promise.all(selectedFiles.map(prepareGymPhoto));
      await analyzeFrames(
        frames,
        "photo",
        `${selectedFiles.length} gym photo${selectedFiles.length === 1 ? "" : "s"}`
      );
    } catch {
      setAnalyzing(false);
      toast({
        title: "Photos could not be prepared",
        description: "Try clearer photos or use the equipment checklist.",
        variant: "destructive",
      });
    }
  };

  const handleVideo = async (file: File | null) => {
    if (!file) return;
    setAnalyzing(true);
    try {
      const frames = await sampleGymVideo(file, 5);
      await analyzeFrames(frames, "video", file.name || "Gym walkthrough");
    } catch {
      setAnalyzing(false);
      toast({
        title: "Video could not be prepared",
        description:
          "Keep the walkthrough under 45 seconds, or use a few gym photos.",
        variant: "destructive",
      });
    }
  };

  const handleSave = async () => {
    if (!user?.uid) {
      toast({ title: "Sign in required", variant: "destructive" });
      return;
    }
    if (!selectedList.length) {
      toast({
        title: "Select your equipment",
        description:
          "Choose at least one item, including open floor space if that is all you have.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const exerciseEquipment = deriveExerciseEquipment(selectedList);
      const profileEquipment = gymProfileEquipment(selectedList);
      const source = sourceFor(Boolean(analysis), mediaKind);
      // Write the subscriber-protected preference first so a permission failure
      // cannot leave only the broader coach profile partially updated.
      await setDoc(
        doc(db, "users", user.uid, "preferences", "gymEquipment"),
        {
          inventory: selectedList,
          exerciseEquipment,
          source,
          locationName: locationName.trim().slice(0, 80),
          notes: notes.trim().slice(0, 280),
          confirmedByUser: true,
          version: 1,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      await setDoc(
        doc(db, "users", user.uid, "coach", "profile"),
        {
          equipment: profileEquipment,
          equipmentInventory: selectedList,
          programPreferences: {
            equipment:
              profileEquipment === "gym" ? "full_gym" : profileEquipment,
          },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      toast({
        title: "Gym setup saved",
        description: `${selectedList.length} confirmed items will guide future plans.`,
      });
      navigate(returnTo ?? "/programs/customize?gym=1");
    } catch (error) {
      toast({
        title: "Gym setup was not saved",
        description:
          error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl p-6" aria-busy="true">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-8">
      <Seo
        title="Set up your gym – MyBodyScan"
        description="Confirm the equipment available for your personalized workout plan."
      />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
        <Button
          variant="ghost"
          className="w-fit"
          onClick={() => navigate(returnTo ?? "/programs")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <Card>
          <CardHeader className="space-y-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Dumbbell className="h-6 w-6" />
            </div>
            <CardTitle className="text-2xl sm:text-3xl">
              What’s in your gym?
            </CardTitle>
            <p className="text-sm leading-6 text-muted-foreground sm:text-base">
              Confirm what you can actually use. Your generated workouts will
              stay within this inventory instead of assuming a full gym.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-20 justify-start gap-3 whitespace-normal text-left"
                onClick={() => videoInputRef.current?.click()}
                disabled={analyzing}
              >
                <Video className="h-5 w-5 shrink-0" />
                <span>
                  <span className="block font-semibold">
                    Record gym walkthrough
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    Up to 45 seconds
                  </span>
                </span>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="min-h-20 justify-start gap-3 whitespace-normal text-left"
                onClick={() => photoInputRef.current?.click()}
                disabled={analyzing}
              >
                <Camera className="h-5 w-5 shrink-0" />
                <span>
                  <span className="block font-semibold">Add gym photos</span>
                  <span className="block text-xs text-muted-foreground">
                    Use 1–6 clear views
                  </span>
                </span>
              </Button>
            </div>
            <input
              ref={videoInputRef}
              className="sr-only"
              type="file"
              accept="video/*"
              capture="environment"
              aria-label="Record or choose a gym walkthrough video"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                event.currentTarget.value = "";
                void handleVideo(file);
              }}
            />
            <input
              ref={photoInputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              multiple
              aria-label="Choose gym photos"
              onChange={(event) => {
                const files = event.currentTarget.files;
                void handlePhotos(files);
                event.currentTarget.value = "";
              }}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Your video stays on this device. Sampled still frames are sent
              securely for one-time equipment analysis and are not saved to your
              MyBodyScan account. Avoid filming other people or private
              information.
            </p>
            {analyzing ? (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Reviewing gym views</AlertTitle>
                <AlertDescription>
                  Preparing a draft inventory for you to confirm…
                </AlertDescription>
              </Alert>
            ) : mediaLabel ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" /> {mediaLabel}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {analysis ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Review required</AlertTitle>
            <AlertDescription>
              We selected clearly visible equipment. Add anything missed and
              remove anything that is not available before saving.
              {analysis.notes ? ` ${analysis.notes}` : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Confirm available equipment</CardTitle>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {selectedList.length} item{selectedList.length === 1 ? "" : "s"}{" "}
              selected
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {GROUPS.map((group) => (
              <fieldset key={group} className="space-y-2">
                <legend className="mb-2 text-sm font-semibold">{group}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {GYM_EQUIPMENT.filter((item) => item.group === group).map(
                    (item) => {
                      const detection = analysis?.detected.find(
                        (entry) => entry.id === item.id
                      );
                      const uncertain = analysis?.uncertain.find(
                        (entry) => entry.id === item.id
                      );
                      return (
                        <Label
                          key={item.id}
                          className="flex min-h-12 cursor-pointer items-start gap-3 rounded-lg border bg-card px-3 py-3 hover:border-primary"
                        >
                          <Checkbox
                            checked={selected.has(item.id)}
                            onCheckedChange={(checked) =>
                              toggle(item.id, checked === true)
                            }
                            aria-label={item.label}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                              {item.label}
                              {detection ? (
                                <Badge variant="secondary">Detected</Badge>
                              ) : null}
                              {uncertain ? (
                                <Badge variant="outline">Check</Badge>
                              ) : null}
                            </span>
                            {(detection || uncertain)?.evidence ? (
                              <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                                {(detection ?? uncertain)?.evidence}
                              </span>
                            ) : null}
                          </span>
                        </Label>
                      );
                    }
                  )}
                </div>
              </fieldset>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gym details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gym-name">Name this setup (optional)</Label>
              <Input
                id="gym-name"
                value={locationName}
                maxLength={80}
                onChange={(event) => setLocationName(event.target.value)}
                placeholder="Apartment gym"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gym-notes">Anything else we should know?</Label>
              <Textarea
                id="gym-notes"
                value={notes}
                maxLength={280}
                rows={3}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Busy after work, no safe place for floor deadlifts…"
              />
            </div>
          </CardContent>
        </Card>

        <div className="sticky bottom-20 z-10 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur md:bottom-4">
          <Button
            className="min-h-12 w-full"
            onClick={handleSave}
            disabled={saving || analyzing || selectedList.length === 0}
          >
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {saving ? "Saving gym setup…" : "Save and personalize my plan"}
          </Button>
        </div>
      </main>
    </div>
  );
}
