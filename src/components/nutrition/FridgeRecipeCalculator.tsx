import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthUser } from "@/auth/mbs-auth";
import { useDemoMode } from "@/components/DemoModeProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FridgeMeal } from "@/lib/fridgeMeals";
import { saveRecipe } from "@/lib/nutritionCollections";
import { MAJOR_ALLERGENS, type MajorAllergen } from "@/lib/nutrition/allergens";
import {
  calculateRecipeTotals,
  type MeasuredIngredient,
} from "@/lib/nutrition/recipeTotals";
import { FoodMacroSummary, nutritionNumber } from "./FoodSearchRow";
import { RecipeFoodPicker } from "./RecipeFoodPicker";

type Row = {
  name: string;
  optional: boolean;
  portion?: MeasuredIngredient | false;
};

function newRecipeId() {
  // Document identity, not a credential; support older iOS WebViews too.
  return `recipe-${typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`;
}

function recipeRows(meal: FridgeMeal): Row[] {
  const seen = new Set<string>();
  return [
    ...meal.uses.map((name) => ({ name, optional: false })),
    ...meal.optional.map((name) => ({ name, optional: true })),
  ].filter((row) => {
    const key = row.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function FridgeRecipeCalculator({
  meal,
  servings,
}: {
  meal: FridgeMeal;
  servings: number;
}) {
  const [open, setOpen] = useState(false);
  const [recipeId] = useState(newRecipeId);
  const { user } = useAuthUser();
  const demo = useDemoMode();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 w-full"
        onClick={() => setOpen(true)}
        disabled={demo || !user?.uid}
      >
        Calculate portions & macros
      </Button>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Make this meal yours</DialogTitle>
          <DialogDescription>
            Match ingredients to food records and enter your portions. Photos
            cannot measure portions or verify nutrition.
          </DialogDescription>
        </DialogHeader>
        {open && user?.uid ? (
          <RecipeEditor
            key={`${user.uid}:${meal.title}`}
            uid={user.uid}
            recipeId={recipeId}
            meal={meal}
            initialServings={servings}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RecipeEditor({
  uid,
  meal,
  initialServings,
  recipeId,
}: {
  uid: string;
  meal: FridgeMeal;
  initialServings: number;
  recipeId: string;
}) {
  const [rows, setRows] = useState<Row[]>(() => recipeRows(meal));
  const [servings, setServings] = useState(String(initialServings));
  const [editing, setEditing] = useState<number | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [allergens, setAllergens] = useState<MajorAllergen[]>([]);
  const [calorieBudget, setCalorieBudget] = useState("");
  const [proteinGoal, setProteinGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveLock = useRef(false);
  const ingredients = useMemo(
    () => rows.flatMap((row) => (row.portion ? [row.portion] : [])),
    [rows]
  );
  const complete =
    rows.length > 0 &&
    rows.every((row) => row.portion !== undefined) &&
    ingredients.length > 0;
  const nutrition = useMemo(() => {
    try {
      return {
        value: calculateRecipeTotals(ingredients, Number(servings)),
        error: null,
      };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : "Check portions.",
      };
    }
  }, [ingredients, servings]);
  const updateRows = (next: Row[]) => {
    setRows(next);
    setReviewed(false);
    setSaved(false);
    setSaveError(null);
  };
  const budget = Number(calorieBudget);
  const protein = Number(proteinGoal);
  const validBudget =
    calorieBudget.trim() !== "" && Number.isFinite(budget) && budget > 0;
  const validProtein =
    proteinGoal.trim() !== "" && Number.isFinite(protein) && protein > 0;
  const save = async () => {
    if (
      saveLock.current ||
      editing !== null ||
      !complete ||
      !nutrition.value ||
      !reviewed
    )
      return;
    saveLock.current = true;
    setSaving(true);
    setSaveError(null);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        saveRecipe(
          {
            id: recipeId,
            name: meal.title,
            servings: Number(servings),
            ingredients,
            allergens,
          },
          uid
        ),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("save_confirmation_timeout")),
            20_000
          );
        }),
      ]);
      setSaved(true);
    } catch {
      setSaveError(
        "Could not confirm the save. Your portions are still here. Check your connection and retry; the same recipe record will be reused."
      );
    } finally {
      clearTimeout(timer);
      saveLock.current = false;
      setSaving(false);
    }
  };
  return (
    <div className="space-y-5">
      <p className="font-semibold">{meal.title}</p>
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="recipe-portion-count">
            Servings in the whole recipe
          </Label>
          <Input
            id="recipe-portion-count"
            className="w-24"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            value={servings}
            onChange={(event) => {
              setServings(event.target.value);
              setReviewed(false);
              setSaved(false);
            }}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Enter amounts for the entire recipe, not one plate. Weigh food where
          possible and match raw or cooked entries.
        </p>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={`${row.name}-${index}`} className="rounded-xl border p-3">
              <p className="text-sm font-medium">
                {row.name}
                {row.optional ? " (optional)" : ""}
              </p>
              {row.portion ? (
                <p className="mt-1 break-words text-xs text-muted-foreground">
                  {row.portion.item.name} · {row.portion.qty} {row.portion.unit}
                </p>
              ) : row.portion === false ? (
                <p className="text-xs text-muted-foreground">
                  Not using in this recipe
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-11"
                  onClick={() => {
                    setEditing(index);
                    setReviewed(false);
                    setSaved(false);
                    setSaveError(null);
                  }}
                  aria-label={`Measure ${row.name}`}
                >
                  {row.portion ? "Change portion" : "Choose food & portion"}
                </Button>
                {row.optional && row.portion !== false ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="min-h-11"
                    onClick={() => {
                      updateRows(
                        rows.map((value, i) =>
                          i === index ? { ...value, portion: false } : value
                        )
                      );
                      if (editing === index) setEditing(null);
                    }}
                    aria-label={`Not using ${row.name}`}
                  >
                    Not using
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
        {editing !== null && rows[editing] ? (
          <RecipeFoodPicker
            key={editing}
            name={rows[editing].name}
            onCancel={() => setEditing(null)}
            onConfirm={(portion) => {
              try {
                calculateRecipeTotals([portion], 1);
              } catch {
                setSaveError(
                  "That portion has incomplete nutrition. Choose another matching food record."
                );
                return;
              }
              updateRows(
                rows.map((row, i) =>
                  i === editing ? { ...row, portion } : row
                )
              );
              setEditing(null);
            }}
          />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          className="min-h-11"
          disabled={rows.length >= 50}
          onClick={() => {
            updateRows([
              ...rows,
              { name: "Additional ingredient", optional: true },
            ]);
            setEditing(rows.length);
          }}
        >
          Add oil, sauce, or another ingredient
        </Button>
        <div
          className="space-y-2 rounded-xl bg-muted/30 p-3"
          aria-live="polite"
        >
          <p className="text-sm font-semibold">
            {complete
              ? "Calculated per serving"
              : "Per-serving subtotal — finish reviewing ingredients"}
          </p>
          <p className="text-xs text-muted-foreground">
            {rows.filter((row) => row.portion !== undefined).length} of{" "}
            {rows.length} ingredients reviewed
          </p>
          {nutrition.value ? (
            <FoodMacroSummary {...nutrition.value.perServing} />
          ) : (
            <p className="text-sm">{nutrition.error}</p>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            Calculated from your selected database/label foods and
            quantities—not AI nutrition guesses. Values remain estimates; check
            labels and include everything used.
          </p>
        </div>
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Compare with my meal budget (optional)
          </summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="recipe-calorie-budget">
                Calories per serving
              </Label>
              <Input
                id="recipe-calorie-budget"
                type="number"
                min={1}
                inputMode="decimal"
                value={calorieBudget}
                onChange={(event) => setCalorieBudget(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recipe-protein-goal">Protein goal (g)</Label>
              <Input
                id="recipe-protein-goal"
                type="number"
                min={1}
                inputMode="decimal"
                value={proteinGoal}
                onChange={(event) => setProteinGoal(event.target.value)}
              />
            </div>
          </div>
          {complete && nutrition.value ? (
            <div className="mt-3 space-y-1 text-sm" role="status">
              {validBudget ? (
                <p>
                  {nutritionNumber(
                    Math.abs(nutrition.value.perServing.calories - budget),
                    true
                  )}{" "}
                  kcal{" "}
                  {nutrition.value.perServing.calories > budget
                    ? "over"
                    : "under"}{" "}
                  your chosen budget per serving.
                </p>
              ) : null}
              {validProtein ? (
                <p>
                  {nutrition.value.perServing.protein >= protein
                    ? "Meets"
                    : "Below"}{" "}
                  your chosen protein goal.
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Change portions or servings to compare—this is a budgeting tool,
                not a dietary prescription.
              </p>
            </div>
          ) : null}
        </details>
        <details className="rounded-xl border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Record allergens found on labels
          </summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {MAJOR_ALLERGENS.map((allergen) => (
              <label
                key={allergen.id}
                className="flex min-h-11 items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={allergens.includes(allergen.id)}
                  onCheckedChange={(checked) => {
                    setAllergens((current) =>
                      checked === true
                        ? [...current, allergen.id]
                        : current.filter((id) => id !== allergen.id)
                    );
                    setReviewed(false);
                    setSaved(false);
                  }}
                />
                {allergen.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            No checkmark is not an allergen-free claim. Check cross-contact
            warnings and every label.
          </p>
        </details>
        <label className="flex min-h-11 items-start gap-3 rounded-xl border p-3 text-sm leading-6">
          <Checkbox
            className="mt-1"
            checked={reviewed}
            disabled={editing !== null || !complete || !nutrition.value}
            onCheckedChange={(checked) => {
              setReviewed(checked === true);
              setSaved(false);
            }}
          />
          I checked every ingredient, amount, raw/cooked state, and allergen
          label for this recipe.
        </label>
      </fieldset>
      {saveError ? (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      ) : null}
      <Button
        type="button"
        className="min-h-12 w-full"
        disabled={
          saving ||
          saved ||
          editing !== null ||
          !reviewed ||
          !complete ||
          !nutrition.value
        }
        onClick={() => void save()}
      >
        {saving
          ? "Saving recipe…"
          : saved
            ? "Recipe saved"
            : "Save to my recipes"}
      </Button>
      {saved ? (
        <p role="status" className="text-sm">
          Saved privately. Open{" "}
          <Link className="underline" to="/meals">
            Food diary
          </Link>{" "}
          and choose it from your recipes to log the portion you eat. Nothing
          was added to your diary automatically.
        </p>
      ) : null}
    </div>
  );
}
