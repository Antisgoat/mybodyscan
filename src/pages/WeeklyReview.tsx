import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, RotateCcw, ShieldAlert } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuthUser } from "@/auth/mbs-auth";
import { useToast } from "@/hooks/use-toast";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useDemoMode } from "@/components/DemoModeProvider";
import { getPlan } from "@/lib/workouts";
import {
  requestWeeklyRecommendation,
  resolveWeeklyReview,
  subscribeLatestWeeklyReview,
  type WeeklyReviewDocument,
  type WeeklyReviewGoal,
  type WeeklyReviewInputs,
  type WeeklyReviewTrend,
} from "@/lib/weeklyReview";

const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function delta(value: number, suffix = "") {
  if (!value) return `No change${suffix}`;
  return `${value > 0 ? "+" : ""}${value}${suffix}`;
}

function ratingLabel(value: number) {
  return `${value} / 5`;
}

export default function WeeklyReview() {
  const { user } = useAuthUser();
  const { profile } = useUserProfile();
  const demo = useDemoMode();
  const { toast } = useToast();
  const [latest, setLatest] = useState<WeeklyReviewDocument | null>(null);
  const [dayId, setDayId] = useState(dayNames[new Date().getDay()]);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const defaultGoal = useMemo<WeeklyReviewGoal>(() => {
    const value = profile?.goal;
    if (value === "lose_fat" || value === "gain_muscle") return value;
    return "recomp";
  }, [profile?.goal]);
  const [form, setForm] = useState({
    hunger: 3,
    energy: 3,
    sleep: 3,
    soreness: 2,
    stress: 3,
    adherence: 80,
    trend: "on_track" as WeeklyReviewTrend,
    goal: defaultGoal,
    notes: "",
  });

  useEffect(() => {
    setForm((current) => ({ ...current, goal: defaultGoal }));
  }, [defaultGoal]);

  useEffect(() => {
    if (!user?.uid) return;
    return subscribeLatestWeeklyReview(user.uid, setLatest, () =>
      setError("We couldn’t load your latest review. Try again.")
    );
  }, [user?.uid]);

  useEffect(() => {
    if (demo) {
      setLoadingPlan(false);
      return;
    }
    let active = true;
    void getPlan()
      .then((plan) => {
        if (!active) return;
        const today = dayNames[new Date().getDay()];
        const chosen =
          plan.days.find((day) => day.day === today) ?? plan.days[0] ?? null;
        if (chosen?.day) setDayId(chosen.day);
      })
      .catch(() => {
        if (active) setError("Create a workout plan before applying a review.");
      })
      .finally(() => {
        if (active) setLoadingPlan(false);
      });
    return () => {
      active = false;
    };
  }, [demo]);

  const updateRating = (
    key: "hunger" | "energy" | "sleep" | "soreness" | "stress",
    value: string
  ) => {
    setForm((current) => ({ ...current, [key]: Number(value) }));
  };

  const submit = async () => {
    if (loadingPlan) return;
    setBusy(true);
    setError(null);
    try {
      const inputs: WeeklyReviewInputs = {
        ...form,
        localDate: localDateKey(),
        dayId,
      };
      const review = await requestWeeklyRecommendation(inputs);
      setLatest(review);
      toast({
        title: "Review ready",
        description: "Nothing changes until you accept it.",
      });
    } catch (submissionError) {
      const message =
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create a review.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const resolve = async (action: "accept" | "decline" | "undo") => {
    if (!latest?.id) return;
    setBusy(true);
    setError(null);
    try {
      await resolveWeeklyReview(latest.id, action);
      setLatest((current) =>
        current
          ? {
              ...current,
              status:
                action === "accept"
                  ? "accepted"
                  : action === "decline"
                    ? "declined"
                    : "reverted",
              activeCalorieDelta:
                action === "accept" ? current.recommendation.calorieDelta : 0,
            }
          : current
      );
      toast({
        title:
          action === "accept"
            ? "Changes accepted"
            : action === "undo"
              ? "Changes undone"
              : "Recommendation declined",
        description:
          action === "accept"
            ? "Your next workout and nutrition target now reflect this review."
            : "Your saved plan remains under your control.",
      });
    } catch (resolutionError) {
      setError(
        resolutionError instanceof Error
          ? resolutionError.message
          : "Unable to update the review."
      );
    } finally {
      setBusy(false);
    }
  };

  const pending = latest?.status === "pending";
  const accepted = latest?.status === "accepted";

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo
        title="Weekly Review - MyBodyScan"
        description="Review recovery and consistency before making a small plan adjustment."
      />
      <main className="mx-auto max-w-2xl space-y-6 p-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <CalendarCheck className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-semibold">Adaptive coaching</span>
          </div>
          <h1 className="text-3xl font-semibold">Weekly review</h1>
          <p className="text-sm text-muted-foreground">
            Check recovery, consistency, and progress. You review every
            recommendation before it changes your plan.
          </p>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Review unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {demo ? (
          <Alert>
            <AlertTitle>Read-only preview</AlertTitle>
            <AlertDescription>
              Sign up and subscribe to create, approve, or undo a weekly plan
              adjustment.
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">How was this week?</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["hunger", "Hunger"],
                ["energy", "Energy"],
                ["sleep", "Sleep quality"],
                ["soreness", "Soreness"],
                ["stress", "Stress"],
              ] as const
            ).map(([key, label]) => (
              <div className="space-y-2" key={key}>
                <Label htmlFor={`weekly-${key}`}>{label}</Label>
                <Select
                  value={String(form[key])}
                  onValueChange={(value) => updateRating(key, value)}
                  disabled={busy}
                >
                  <SelectTrigger id={`weekly-${key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <SelectItem key={value} value={String(value)}>
                        {ratingLabel(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="space-y-2">
              <Label htmlFor="weekly-adherence">Plan consistency</Label>
              <Select
                value={String(form.adherence)}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    adherence: Number(value),
                  }))
                }
                disabled={busy}
              >
                <SelectTrigger id="weekly-adherence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[40, 50, 60, 70, 80, 90, 100].map((value) => (
                    <SelectItem key={value} value={String(value)}>
                      {value}%
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="weekly-trend">Goal trend</Label>
              <Select
                value={form.trend}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    trend: value as WeeklyReviewTrend,
                  }))
                }
                disabled={busy}
              >
                <SelectTrigger id="weekly-trend">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on_track">On track</SelectItem>
                  <SelectItem value="stalled">Stalled</SelectItem>
                  <SelectItem value="too_fast">Changing too fast</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="weekly-goal">Current goal</Label>
              <Select
                value={form.goal}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    goal: value as WeeklyReviewGoal,
                  }))
                }
                disabled={busy}
              >
                <SelectTrigger id="weekly-goal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lose_fat">Lose fat</SelectItem>
                  <SelectItem value="gain_muscle">Gain muscle</SelectItem>
                  <SelectItem value="recomp">Recomposition</SelectItem>
                  <SelectItem value="maintain">Maintain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="weekly-notes">Context (optional)</Label>
              <Textarea
                id="weekly-notes"
                value={form.notes}
                maxLength={500}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Travel, extra activity, schedule changes, or anything else that affected the week."
                disabled={busy}
              />
            </div>
            <Button
              className="sm:col-span-2"
              onClick={submit}
              disabled={busy || loadingPlan || demo}
            >
              {demo
                ? "Sign up to create a recommendation"
                : busy
                  ? "Reviewing…"
                  : "Create recommendation"}
            </Button>
          </CardContent>
        </Card>

        {latest ? (
          <Card className={accepted ? "border-primary/40" : undefined}>
            <CardHeader>
              <CardTitle className="text-lg">
                {latest.recommendation.headline}
              </CardTitle>
              <p className="text-sm capitalize text-muted-foreground">
                Status: {latest.status}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Calories</p>
                  <p className="font-semibold">
                    {delta(latest.recommendation.calorieDelta, " kcal/day")}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Intensity</p>
                  <p className="font-semibold">
                    {delta(latest.recommendation.intensityDelta, " step")}
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">Volume</p>
                  <p className="font-semibold">
                    {delta(latest.recommendation.volumeDelta, " set")}
                  </p>
                </div>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {latest.recommendation.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              {latest.recommendation.caution ? (
                <Alert>
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle>Safety note</AlertTitle>
                  <AlertDescription>
                    {latest.recommendation.caution}
                  </AlertDescription>
                </Alert>
              ) : null}
              {pending ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button onClick={() => resolve("accept")} disabled={busy}>
                    Accept changes
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => resolve("decline")}
                    disabled={busy}
                  >
                    Keep current plan
                  </Button>
                </div>
              ) : null}
              {accepted ? (
                <Button
                  variant="outline"
                  onClick={() => resolve("undo")}
                  disabled={busy}
                >
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Undo accepted changes
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>General wellness guidance</AlertTitle>
          <AlertDescription>
            Weekly recommendations are estimates, not medical or dietetic care.
            Avoid extreme changes and consult a qualified professional for
            medical concerns, pregnancy, an eating-disorder history, or
            prescribed diets.{" "}
            <Link className="underline" to="/legal/disclaimer">
              Read the health disclaimer
            </Link>
            .
          </AlertDescription>
        </Alert>
      </main>
    </div>
  );
}
