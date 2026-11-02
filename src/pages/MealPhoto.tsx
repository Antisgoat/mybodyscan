import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemoMode } from "@/components/DemoModeProvider";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";
import { prepareGymPhoto } from "@/lib/gymCapture";
import {
  chooseNativePhoto,
  dataUrlToImageFile,
  isMediaPickerCancellation,
  takeNativePhoto,
  usesNativePhotoPicker,
} from "@/lib/nativePhoto";
import { callCallable } from "@/lib/backend/callBackend";
import { addMeal } from "@/lib/nutritionBackend";
import { FoodMacroSummary } from "@/components/nutrition/FoodSearchRow";
import {
  MEAL_PHOTO_PORTIONS,
  mealPhotoPortion,
  readMealPhotoEstimate,
  type MealPhotoEstimate as Estimate,
} from "@/lib/mealPhotoReview";

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
  const [foodHint, setFoodHint] = useState("");
  const [message, setMessage] = useState("");
  const [saved, setSaved] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [portionPercent, setPortionPercent] = useState(100);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const valid =
    estimate &&
    estimate.name.trim() &&
    [estimate.protein, estimate.carbs, estimate.fat].every(
      (n) => Number.isFinite(n) && n >= 0 && n <= 500
    );
  const portion = estimate ? mealPhotoPortion(estimate, portionPercent) : null;
  const calories = portion?.calories ?? 0;

  function editEstimate(next: Estimate) {
    setEstimate(next);
    setReviewed(false);
  }

  async function analyze(file?: File | string) {
    if (!file || !allowed || !consent || lock.current) return;
    lock.current = true;
    setBusy(true);
    setEstimate(null);
    setSaved(false);
    setReviewed(false);
    setPortionPercent(100);
    setPhotoPreview(null);
    saveDate.current = null;
    setMessage("");
    try {
      if (typeof file !== "string" && file.size > 20 * 1024 * 1024)
        throw new Error("large_file");
      const preparedFile =
        typeof file === "string"
          ? await dataUrlToImageFile(file, `meal-${Date.now()}.jpg`)
          : file;
      const image = await prepareGymPhoto(preparedFile);
      // A downsampled preview stays only in this screen's memory, never storage.
      setPhotoPreview(image);
      const result = await callCallable<
        { image: string; foodHint?: string; processingConsent: boolean },
        Estimate
      >("analyzeMealPhoto", {
        image,
        foodHint: foodHint.trim() || undefined,
        processingConsent: true,
      });
      setEstimate(readMealPhotoEstimate(result));
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

  async function openNativePhoto(source: "camera" | "library") {
    try {
      await analyze(
        source === "camera"
          ? await takeNativePhoto()
          : await chooseNativePhoto()
      );
    } catch (error) {
      if (isMediaPickerCancellation(error)) return;
      setMessage(
        source === "camera"
          ? "Camera access is unavailable. Allow Camera access in iPhone Settings, or choose a saved photo."
          : "Photo access is unavailable. Allow Photos access in iPhone Settings, or take a new photo."
      );
    }
  }

  async function save() {
    if (
      !allowed ||
      !valid ||
      !reviewed ||
      !estimate ||
      !portion ||
      saved ||
      lock.current
    )
      return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    const now = new Date();
    const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    saveDate.current ??= date;
    try {
      await addMeal(saveDate.current, {
        id: `photo-${estimate.requestId}`,
        name:
          portionPercent === 100
            ? estimate.name.trim()
            : `${estimate.name.trim().slice(0, 110)} · ${portionPercent}% portion`,
        mealType,
        protein: portion.protein,
        carbs: portion.carbs,
        fat: portion.fat,
        calories,
        entrySource: "photo-estimate",
        notes: `Photo estimate reviewed by member; ${portionPercent}% of pictured meal. Not a weighed measurement.`,
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
        <label className="block space-y-2 text-sm font-medium">
          What is on the plate?{" "}
          <span className="font-normal text-muted-foreground">
            (recommended)
          </span>
          <Input
            value={foodHint}
            maxLength={160}
            disabled={!allowed || busy}
            onChange={(event) => setFoodHint(event.target.value)}
            placeholder="Example: grilled salmon, rice, and broccoli"
          />
          <span className="block text-xs font-normal leading-5 text-muted-foreground">
            A short hint helps distinguish visually similar foods. The photo
            must still support it.
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={consent}
            disabled={!allowed || busy}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4 shrink-0"
          />
          <span>
            I agree to securely process this meal photo. MyBodyScan does not
            save the photo in my diary; a specialized processing provider may
            temporarily handle it and its retention policies apply.{" "}
            <Link to="/legal/privacy" className="underline">
              Privacy details
            </Link>
            .
          </span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Button
            disabled={!allowed || !consent || busy}
            onClick={() => {
              if (usesNativePhotoPicker()) void openNativePhoto("camera");
              else camera.current?.click();
            }}
          >
            Take photo
          </Button>
          <Button
            variant="outline"
            disabled={!allowed || !consent || busy}
            onClick={() => {
              if (usesNativePhotoPicker()) void openNativePhoto("library");
              else library.current?.click();
            }}
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
        {photoPreview && (
          <img
            src={photoPreview}
            alt="Your selected meal photo for comparison"
            className="max-h-64 w-full rounded-2xl object-contain bg-muted"
          />
        )}
      </section>
      {estimate && (
        <section className="space-y-4 rounded-3xl border bg-card p-5">
          <h2 className="text-lg font-semibold">Review your estimate</h2>
          <p className="text-sm text-muted-foreground">
            Estimated food pictured: {Math.round(estimate.grams)} g. Review the
            totals for the entire photo below, then choose how much you ate.
            Oils, sauces, and portion size can change the result substantially.
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            {estimate.confidence < 0.78
              ? "Extra review needed: the food or portion is uncertain."
              : "Review needed: photo estimates can miss ingredients and portions."}
          </p>
          <p className="text-sm leading-6 text-muted-foreground">
            Wrong food? Don't just rename it—the nutrition would still describe
            the original guess. Use food search to choose the correct food, or
            try a clearer photo with a short hint.
          </p>
          <p className="text-sm leading-6">{estimate.notes}</p>
          <label className="block space-y-2 text-sm">
            Meal name
            <Input
              maxLength={120}
              value={estimate.name}
              disabled={busy || saved}
              onChange={(e) =>
                editEstimate({ ...estimate, name: e.target.value })
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
                    editEstimate({
                      ...estimate,
                      [key]:
                        e.target.value === "" ? NaN : Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <div className="space-y-2 text-sm">
            <label htmlFor="meal-photo-portion">
              How much of the pictured meal did you eat?
            </label>
            <select
              id="meal-photo-portion"
              aria-describedby="meal-photo-portion-help"
              className="block h-11 w-full rounded-xl border bg-background px-3"
              value={portionPercent}
              disabled={busy || saved}
              onChange={(e) => {
                setPortionPercent(Number(e.target.value));
                setReviewed(false);
              }}
            >
              {MEAL_PHOTO_PORTIONS.map((percent) => (
                <option key={percent} value={percent}>
                  {percent}%
                  {percent === 100
                    ? " · All of it"
                    : percent === 50
                      ? " · Half"
                      : percent === 25
                        ? " · A quarter"
                        : ""}
                </option>
              ))}
            </select>
            <span
              id="meal-photo-portion-help"
              className="block text-xs text-muted-foreground"
            >
              The editable macros above describe the entire photo. This choice
              scales your logged portion locally; it does not request another
              estimate.
            </span>
          </div>
          <div className="space-y-2" aria-live="polite">
            <h3 className="text-sm font-semibold">
              Your portion · {portionPercent}% of the photo
            </h3>
            <FoodMacroSummary
              calories={calories}
              protein={portion?.protein}
              carbs={portion?.carbs}
              fat={portion?.fat}
            />
            <p className="text-xs text-muted-foreground">
              Estimated calories calculated from reviewed macros.
            </p>
          </div>
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
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0"
              checked={reviewed}
              disabled={busy || saved}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <span>
              The identified food matches my photo, and I reviewed the portion,
              ingredients, oils, and sauces.
            </span>
          </label>
          <Button
            className="w-full"
            disabled={!valid || !reviewed || !allowed || busy || saved}
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
