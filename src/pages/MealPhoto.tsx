import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemoMode } from "@/components/DemoModeProvider";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";
import { prepareGymPhoto } from "@/lib/gymCapture";
import { callCallable } from "@/lib/backend/callBackend";
import { addMeal } from "@/lib/nutritionBackend";

type Estimate = {
  name: string;
  protein: number;
  carbs: number;
  fat: number;
  grams: number;
  notes: string;
  requestId: string;
};

export default function MealPhoto() {
  const demo = useDemoMode();
  const { entitlements } = useEntitlements();
  const allowed = !demo && hasPro(entitlements);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const saveDate = useRef<string | null>(null);
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [mealType, setMealType] = useState("lunch");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const valid =
    estimate &&
    estimate.name.trim() &&
    [estimate.protein, estimate.carbs, estimate.fat].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 500
    );
  const calories = estimate
    ? Math.round(estimate.protein * 4 + estimate.carbs * 4 + estimate.fat * 9)
    : 0;

  async function analyze(file?: File) {
    if (!file || !allowed || !consent || lock.current) return;
    lock.current = true;
    setBusy(true);
    setEstimate(null);
    setSaved(false);
    saveDate.current = null;
    setMessage("");
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("large_file");
      const image = await prepareGymPhoto(file);
      const result = await callCallable<
        { image: string; processingConsent: boolean },
        Estimate
      >("analyzeMealPhoto", { image, processingConsent: true });
      setEstimate(result);
    } catch (error) {
      const code = String((error as any)?.code ?? "");
      setMessage(
        code.includes("resource-exhausted")
          ? "Your photo estimate limit has been reached. Use search or manual entry instead."
          : code.includes("permission-denied")
            ? "An active monthly or yearly membership is required."
            : "Photo estimates are unavailable right now. Use food search instead. Nothing was logged."
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  async function save() {
    if (!allowed || !valid || !estimate || saved || lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    saveDate.current ??= date;
    try {
      await addMeal(saveDate.current, {
        id: `photo-${estimate.requestId}`,
        name: estimate.name.trim(),
        mealType,
        protein: estimate.protein,
        carbs: estimate.carbs,
        fat: estimate.fat,
        calories,
        entrySource: "photo-estimate",
        notes: "Photo estimate reviewed by member; not a weighed measurement.",
      });
      setSaved(true);
      setMessage("Meal saved to today's diary.");
    } catch {
      setMessage(
        "Could not confirm saving. Retry to save the same entry without adding a duplicate."
      );
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  return (
    <main className="mx-auto w-full max-w-xl space-y-5 px-4 py-6">
      <Link to="/meals" className="text-sm text-primary">
        ← Food diary
      </Link>
      <header className="rounded-3xl bg-slate-950 p-6 text-white">
        <Camera className="mb-4 h-7 w-7 text-cyan-300" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300">
          Member feature
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Snap. Review. Log.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          A quick starting estimate for your meal. For better accuracy, weigh
          food and use its nutrition label or food search.
        </p>
      </header>
      {!allowed && (
        <p className="rounded-2xl border p-4 text-sm">
          {demo
            ? "Demo preview only. No photos are sent or analyzed."
            : "Photo estimates require an active monthly or yearly membership."}
        </p>
      )}
      <section className="space-y-4 rounded-3xl border bg-card p-5">
        <h2 className="text-lg font-semibold">One photo of your meal</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          Up to 3 analysis attempts per rolling 24 hours. Include the whole
          plate. Avoid faces, documents, and other private information.
        </p>
        <label className="flex items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={consent}
            disabled={!allowed || busy}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span>
            I agree to send this meal photo to OpenAI for processing. MyBodyScan
            does not save the photo in my diary; provider retention policies
            apply.{" "}
            <Link to="/legal/privacy" className="underline">
              Privacy details
            </Link>
            .
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Button
            disabled={!allowed || !consent || busy}
            onClick={() => camera.current?.click()}
          >
            Take photo
          </Button>
          <Button
            variant="outline"
            disabled={!allowed || !consent || busy}
            onClick={() => library.current?.click()}
          >
            Choose photo
          </Button>
        </div>
        <input
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => {
            void analyze(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <input
          ref={library}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void analyze(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        {busy && (
          <p role="status" className="text-sm">
            Working… please keep this page open.
          </p>
        )}
      </section>
      {estimate && (
        <section className="space-y-4 rounded-3xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Review your estimate</h2>
          <p className="text-sm text-muted-foreground">
            Estimated portion: {Math.round(estimate.grams)} g. Oils, sauces, and
            portion size can change the result substantially. Correct the totals
            below for what you actually ate.
          </p>
          <p className="text-sm leading-6">{estimate.notes}</p>
          <label className="block space-y-2 text-sm">
            Meal name
            <Input
              maxLength={120}
              value={estimate.name}
              disabled={busy || saved}
              onChange={(e) =>
                setEstimate({ ...estimate, name: e.target.value })
              }
            />
          </label>
          <div className="grid grid-cols-3 gap-3">
            {(["protein", "carbs", "fat"] as const).map((key) => (
              <label key={key} className="space-y-2 text-sm capitalize">
                {key} (g)
                <Input
                  type="number"
                  min={0}
                  max={500}
                  step="0.1"
                  inputMode="decimal"
                  disabled={busy || saved}
                  value={Number.isNaN(estimate[key]) ? "" : estimate[key]}
                  onChange={(e) =>
                    setEstimate({
                      ...estimate,
                      [key]:
                        e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="text-2xl font-semibold">
            {Number.isFinite(calories) ? calories : "—"}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              estimated kcal · calculated from macros
            </span>
          </p>
          <label className="block space-y-2 text-sm">
            Add to
            <select
              className="block h-11 w-full rounded-xl border bg-background px-3"
              value={mealType}
              disabled={busy || saved}
              onChange={(e) => setMealType(e.target.value)}
            >
              {["breakfast", "lunch", "dinner", "snacks"].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs leading-5 text-muted-foreground">
            Photos cannot verify allergens or food safety. Check ingredients and
            labels yourself. This is a tracking estimate, not medical advice.
          </p>
          <Button
            className="w-full"
            disabled={!valid || !allowed || busy || saved}
            onClick={() => void save()}
          >
            {saved ? "Saved" : "Confirm and log meal"}
          </Button>
        </section>
      )}
      {message && (
        <p role="status" className="rounded-2xl border p-4 text-sm">
          {message}
        </p>
      )}
      <Button asChild variant="outline" className="w-full">
        <Link to="/meals/search">Use food search instead</Link>
      </Button>
    </main>
  );
}
