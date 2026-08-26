import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Camera,
  Check,
  ChefHat,
  Clock3,
  Loader2,
  Plus,
  Refrigerator,
  ShieldCheck,
  X,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import { useNutritionSafety } from "@/hooks/useNutritionSafety";
import { useUserProfile } from "@/hooks/useUserProfile";
import { callCallable } from "@/lib/backend/callBackend";
import { prepareGymPhoto } from "@/lib/gymCapture";
import type { FridgeAnalysis, FridgeMealSuggestions } from "@/lib/fridgeMeals";

function ingredientKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

export default function FridgeMeals() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { profile } = useUserProfile();
  const { preferences } = useNutritionSafety();
  const [analysis, setAnalysis] = useState<FridgeAnalysis | null>(null);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [manualIngredient, setManualIngredient] = useState("");
  const [servings, setServings] = useState(2);
  const [analyzing, setAnalyzing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<FridgeMealSuggestions | null>(
    null
  );
  const [photoCount, setPhotoCount] = useState(0);

  const candidates = useMemo(
    () => [...(analysis?.detected ?? []), ...(analysis?.uncertain ?? [])],
    [analysis]
  );
  const confirmed = useMemo(() => Array.from(selected.values()), [selected]);

  const setIngredient = (name: string, checked: boolean) => {
    const clean = name.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!clean) return;
    setSelected((current) => {
      const next = new Map(current);
      if (checked) next.set(ingredientKey(clean), clean);
      else next.delete(ingredientKey(clean));
      return next;
    });
    setSuggestions(null);
  };

  const addManualIngredient = () => {
    const value = manualIngredient.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!value) return;
    setIngredient(value, true);
    setManualIngredient("");
  };

  const handlePhotos = async (files: FileList | null) => {
    const photos = Array.from(files ?? []).slice(0, 4);
    if (!photos.length) return;
    setAnalyzing(true);
    setAnalysis(null);
    setSuggestions(null);
    setPhotoCount(photos.length);
    try {
      const frames = await Promise.all(photos.map(prepareGymPhoto));
      const result = await callCallable<{ frames: string[] }, FridgeAnalysis>(
        "analyzeFridge",
        { frames }
      );
      setAnalysis(result);
      setSelected(
        new Map(
          result.detected
            .filter((item) => item.confidence >= 0.65)
            .map((item) => [ingredientKey(item.name), item.name])
        )
      );
      toast({
        title: "Draft ingredient list ready",
        description: "Confirm every item before creating meal ideas.",
      });
    } catch (error) {
      setPhotoCount(0);
      toast({
        title: "Could not review those photos",
        description:
          error instanceof Error
            ? error.message
            : "Try clearer photos or enter ingredients manually.",
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const generateMeals = async () => {
    if (!confirmed.length) {
      toast({
        title: "Confirm at least one ingredient",
        variant: "destructive",
      });
      return;
    }
    setGenerating(true);
    setSuggestions(null);
    try {
      const result = await callCallable<
        {
          ingredients: string[];
          servings: number;
          diet?: string;
          goal?: string;
          allergies: string[];
          allergyNotes: string;
        },
        FridgeMealSuggestions
      >("suggestFridgeMeals", {
        ingredients: confirmed,
        servings,
        diet: profile?.diet_preference ?? profile?.diet,
        goal: profile?.goal,
        allergies: preferences.allergies,
        allergyNotes: preferences.allergyNotes,
      });
      setSuggestions(result);
    } catch (error) {
      toast({
        title: "Meal ideas could not be created",
        description:
          error instanceof Error ? error.message : "Please try again shortly.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-8">
      <Seo
        title="Fridge Scan – MyBodyScan"
        description="Confirm visible ingredients and get personalized meal ideas."
      />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-5 sm:px-6">
        <Button variant="ghost" className="w-fit" asChild>
          <Link to="/meals">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Food Diary
          </Link>
        </Button>

        <Card className="overflow-hidden">
          <CardHeader className="space-y-3 bg-gradient-to-br from-primary/10 via-background to-emerald-500/10">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
              <Refrigerator className="h-6 w-6" />
            </div>
            <div>
              <Badge variant="secondary" className="mb-2">
                Pro meal helper
              </Badge>
              <h1 className="text-2xl font-semibold leading-none tracking-tight sm:text-3xl">
                What can you make right now?
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                Photograph your fridge, freezer, pantry, or counter. We’ll draft
                an ingredient list for you to correct before creating meal
                ideas.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-5">
            <Button
              type="button"
              className="min-h-14 w-full gap-3"
              onClick={() => inputRef.current?.click()}
              disabled={analyzing}
            >
              {analyzing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
              {analyzing ? "Reviewing photos…" : "Take or choose food photos"}
            </Button>
            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              aria-label="Take or choose refrigerator and pantry photos"
              onChange={(event) => {
                const files = event.currentTarget.files;
                event.currentTarget.value = "";
                void handlePhotos(files);
              }}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              Use 1–4 clear photos. They are sent securely for this one-time
              review and are not saved to your MyBodyScan account. Avoid people,
              addresses, receipts, or other private information.
            </p>
            {photoCount > 0 && !analyzing ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-primary" /> {photoCount} photo
                {photoCount === 1 ? "" : "s"} reviewed
              </div>
            ) : null}
          </CardContent>
        </Card>

        {analysis ? (
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Confirm what is actually available</AlertTitle>
            <AlertDescription>
              Photo detection can miss or misidentify food. Remove mistakes, add
              anything hidden, and check freshness and package labels.
              {analysis.notes ? ` ${analysis.notes}` : ""}
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Confirmed ingredients</CardTitle>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {confirmed.length} ingredient{confirmed.length === 1 ? "" : "s"}{" "}
              selected
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {candidates.length ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {candidates.map((item) => {
                  const key = ingredientKey(item.name);
                  const isUncertain = analysis?.uncertain.includes(item);
                  return (
                    <Label
                      key={`${key}-${isUncertain ? "uncertain" : "detected"}`}
                      className="flex min-h-16 cursor-pointer items-start gap-3 rounded-xl border p-3 hover:border-primary"
                    >
                      <Checkbox
                        checked={selected.has(key)}
                        onCheckedChange={(checked) =>
                          setIngredient(item.name, checked === true)
                        }
                        aria-label={`Confirm ${item.name}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2 font-medium capitalize">
                          {item.name}
                          <Badge
                            variant={isUncertain ? "outline" : "secondary"}
                          >
                            {isUncertain ? "Check" : "Visible"}
                          </Badge>
                        </span>
                        <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                          {item.evidence}
                        </span>
                      </span>
                    </Label>
                  );
                })}
              </div>
            ) : null}

            {confirmed.length ? (
              <div
                className="flex flex-wrap gap-2"
                aria-label="Confirmed ingredient list"
              >
                {confirmed.map((name) => (
                  <Badge
                    key={ingredientKey(name)}
                    variant="secondary"
                    className="gap-1 py-1.5 pl-3 pr-1.5"
                  >
                    {name}
                    <button
                      type="button"
                      className="rounded-full p-1 hover:bg-background"
                      onClick={() => setIngredient(name, false)}
                      aria-label={`Remove ${name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Input
                value={manualIngredient}
                maxLength={80}
                placeholder="Add a missed ingredient"
                aria-label="Add a missed ingredient"
                onChange={(event) => setManualIngredient(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addManualIngredient();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={addManualIngredient}
                disabled={!manualIngredient.trim()}
              >
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-xl border bg-muted/30 p-3">
              <Label htmlFor="fridge-servings">Servings</Label>
              <Input
                id="fridge-servings"
                className="w-24 text-center"
                type="number"
                inputMode="numeric"
                min={1}
                max={8}
                value={servings}
                onChange={(event) =>
                  setServings(
                    Math.max(1, Math.min(8, Number(event.target.value) || 1))
                  )
                }
              />
            </div>

            <Button
              className="min-h-12 w-full"
              onClick={() => void generateMeals()}
              disabled={generating || analyzing || confirmed.length === 0}
            >
              {generating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ChefHat className="mr-2 h-4 w-4" />
              )}
              {generating
                ? "Creating meal ideas…"
                : "Create personalized meal ideas"}
            </Button>
          </CardContent>
        </Card>

        {suggestions ? (
          <section className="space-y-4" aria-labelledby="meal-ideas-title">
            <div>
              <h2 id="meal-ideas-title" className="text-xl font-semibold">
                Ideas from your kitchen
              </h2>
              <p className="text-sm text-muted-foreground">
                Built from your confirmed list and saved preferences.
              </p>
            </div>
            {suggestions.meals.map((meal, index) => (
              <Card key={`${meal.title}-${index}`}>
                <CardHeader className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="text-lg">{meal.title}</CardTitle>
                    <Badge variant="outline" className="shrink-0 gap-1">
                      <Clock3 className="h-3.5 w-3.5" /> {meal.estimatedMinutes}{" "}
                      min
                    </Badge>
                  </div>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {meal.summary}
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Uses what you have
                    </p>
                    <p className="mt-1 text-sm">{meal.uses.join(", ")}</p>
                  </div>
                  {meal.optional.length ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Optional staples
                      </p>
                      <p className="mt-1 text-sm">{meal.optional.join(", ")}</p>
                    </div>
                  ) : null}
                  <ol className="space-y-2">
                    {meal.steps.map((step, stepIndex) => (
                      <li
                        key={`${stepIndex}-${step}`}
                        className="flex gap-3 text-sm leading-6"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {stepIndex + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                  {meal.whyItFits ? (
                    <p className="rounded-lg bg-muted/50 p-3 text-sm leading-6">
                      <span className="font-semibold">Why it fits: </span>
                      {meal.whyItFits}
                    </p>
                  ) : null}
                  <p className="text-xs leading-5 text-muted-foreground">
                    {meal.safetyNote}
                  </p>
                </CardContent>
              </Card>
            ))}
          </section>
        ) : null}

        <Alert>
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Photos cannot verify food safety or allergens</AlertTitle>
          <AlertDescription>
            Check freshness, expiration dates, current labels, cross-contact
            statements, and safe cooking temperatures. These are meal ideas, not
            medical or allergen-safety advice.
          </AlertDescription>
        </Alert>
      </main>
    </div>
  );
}
