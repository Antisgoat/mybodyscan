import { useEffect, useId, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FoodItem } from "@/lib/nutrition/types";
import {
  availableServingUnits,
  type ServingUnit,
  calculateSelection,
  gramsToOunces,
  buildMealEntry,
} from "@/lib/nutritionMath";
import type { MealEntry } from "@/lib/nutritionBackend";
import { FoodMacroSummary, nutritionNumber } from "./FoodSearchRow";

interface ServingEditorProps {
  item: FoodItem;
  defaultQty?: number;
  defaultUnit?: ServingUnit;
  confirmLabel?: string;
  onConfirm: (payload: {
    qty: number;
    unit: ServingUnit;
    result: ReturnType<typeof calculateSelection>;
    meal: MealEntry;
  }) => void;
  onCancel?: () => void;
  busy?: boolean;
  entrySource?: MealEntry["entrySource"];
  readOnly?: boolean;
  onDemoAttempt?: () => void;
}

const UNIT_LABELS: Record<ServingUnit, string> = {
  serving: "Serving",
  g: "Grams (g)",
  oz: "Ounces (oz)",
  ml: "Milliliters (ml)",
  cups: "Cups",
  slices: "Slices",
  pieces: "Pieces",
};

export function ServingEditor({
  item,
  defaultQty = 1,
  defaultUnit = "serving",
  confirmLabel = "Add to diary",
  onConfirm,
  onCancel,
  busy,
  entrySource = "search",
  readOnly = false,
  onDemoAttempt,
}: ServingEditorProps) {
  const fieldId = useId();
  const [quantityDraft, setQuantityDraft] = useState(String(defaultQty));
  const quantity = Number(quantityDraft);
  const [unit, setUnit] = useState<ServingUnit>(defaultUnit);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setQuantityDraft(String(defaultQty));
    const units = availableServingUnits(item);
    setUnit(
      units.includes(defaultUnit)
        ? defaultUnit
        : units.includes("serving")
          ? "serving"
          : (units[0] ?? "g")
    );
    setNotes("");
  }, [item, defaultQty, defaultUnit]);

  const result = useMemo(
    () => calculateSelection(item, quantity, unit),
    [item, quantity, unit]
  );
  const availableUnits = useMemo(() => availableServingUnits(item), [item]);
  const validQuantity =
    quantityDraft.trim() !== "" && Number.isFinite(quantity) && quantity > 0;
  const hasNutrition = [
    result.calories,
    result.protein,
    result.carbs,
    result.fat,
  ].some((value) => value != null && Number.isFinite(value));

  const submit = () => {
    if (busy || !validQuantity || !hasNutrition) return;
    if (readOnly) {
      onDemoAttempt?.();
      return;
    }
    const meal = buildMealEntry(item, quantity, unit, result, entrySource);
    if (notes.trim()) meal.notes = notes.trim();
    onConfirm({ qty: quantity, unit, result, meal });
  };

  return (
    <div className="space-y-5" aria-busy={busy || undefined}>
      <FoodMacroSummary {...result} />
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3">
        <div className="space-y-2">
          <Label htmlFor={fieldId + "-qty"}>Quantity</Label>
          <Input
            id={fieldId + "-qty"}
            type="number"
            min="0"
            step="any"
            inputMode="decimal"
            value={quantityDraft}
            onChange={(event) => setQuantityDraft(event.target.value)}
            disabled={busy}
            className="h-12 rounded-xl text-base"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={fieldId + "-unit"}>Portion</Label>
          <select
            id={fieldId + "-unit"}
            value={unit}
            onChange={(event) => setUnit(event.target.value as ServingUnit)}
            disabled={busy}
            className="h-12 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {availableUnits.map((option) => (
              <option key={option} value={option}>
                {option === "serving" && item.serving.text
                  ? item.serving.text
                  : UNIT_LABELS[option]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {result.grams
          ? nutritionNumber(result.grams) +
            " g (" +
            nutritionNumber(gramsToOunces(result.grams)) +
            " oz) · "
          : ""}
        Nutrition is for the selected portion. Match raw or cooked preparation
        to what you weigh.
      </p>
      <p className="text-xs text-muted-foreground">
        Data:{" "}
        {item.source === "Open Food Facts" ? (
          <a
            href="https://world.openfoodfacts.org/"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            Open Food Facts
          </a>
        ) : (
          item.source
        )}
      </p>
      {!hasNutrition && (
        <p role="alert" className="text-sm text-destructive">
          Nutrition is unavailable for this portion. Choose another unit or
          food.
        </p>
      )}
      <details className="text-sm">
        <summary className="min-h-9 cursor-pointer text-muted-foreground">
          Add a note
        </summary>
        <Textarea
          aria-label="Preparation notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add preparation notes"
          rows={2}
          disabled={busy}
          className="rounded-xl"
          maxLength={1000}
        />
      </details>
      <div className="flex gap-2 border-t pt-4">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
            className="h-12 rounded-xl"
          >
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={submit}
          disabled={busy || !validQuantity || !hasNutrition || readOnly}
          title={readOnly ? "Demo mode: sign in to save" : undefined}
          className="h-12 flex-1 rounded-xl text-sm font-semibold"
        >
          {busy && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {readOnly ? "Demo only" : busy ? "Saving to diary…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
