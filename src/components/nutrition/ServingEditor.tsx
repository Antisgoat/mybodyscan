import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { FoodItem } from "@/lib/nutrition/types";
import {
  SERVING_UNITS,
  type ServingUnit,
  calculateSelection,
  gramsToOunces,
  buildMealEntry,
  estimateServingWeight,
} from "@/lib/nutritionMath";
import type { MealEntry } from "@/lib/nutritionBackend";

interface ServingEditorProps {
  item: FoodItem;
  defaultQty?: number;
  defaultUnit?: ServingUnit;
  confirmLabel?: string;
  onConfirm: (payload: { qty: number; unit: ServingUnit; result: ReturnType<typeof calculateSelection>; meal: MealEntry }) => void;
  onCancel?: () => void;
  busy?: boolean;
  entrySource?: MealEntry["entrySource"];
  readOnly?: boolean;
  onDemoAttempt?: () => void;
}

export function ServingEditor({
  item,
  defaultQty = 1,
  defaultUnit = "serving",
  confirmLabel = "Add",
  onConfirm,
  onCancel,
  busy,
  entrySource = "search",
  readOnly = false,
  onDemoAttempt,
}: ServingEditorProps) {
  const [quantity, setQuantity] = useState<number>(defaultQty);
  const [unit, setUnit] = useState<ServingUnit>(defaultUnit);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setQuantity(defaultQty);
    setUnit(defaultUnit);
    setNotes("");
  }, [item, defaultQty, defaultUnit]);

  const result = useMemo(() => calculateSelection(item, quantity, unit), [item, quantity, unit]);
  const servingWeight = useMemo(() => estimateServingWeight(item), [item]);

  const submit = () => {
    if (readOnly) {
      onDemoAttempt?.();
      return;
    }
    const meal = buildMealEntry(item, quantity, unit, result, entrySource);
    if (notes.trim()) {
      meal.notes = notes.trim();
    }
    onConfirm({ qty: quantity, unit, result, meal });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="serving-qty">Quantity</Label>
          <Input
            id="serving-qty"
            type="number"
            min="0"
            step="0.1"
            value={quantity}
            onChange={(event) => setQuantity(Number(event.target.value) || 0)}
          />
        </div>
        <div>
          <Label htmlFor="serving-unit">Unit</Label>
          <Select value={unit} onValueChange={(value) => setUnit(value as ServingUnit)}>
            <SelectTrigger id="serving-unit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SERVING_UNITS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === "serving" && item.serving.text
                    ? `serving (${item.serving.text})`
                    : option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Calories</Label>
          <div className="text-lg font-semibold">{result.calories ?? "—"} kcal</div>
        </div>
        <div>
          <Label>Macros</Label>
          <div className="text-sm text-muted-foreground">
            {result.protein ?? "—"}g P • {result.carbs ?? "—"}g C • {result.fat ?? "—"}g F
          </div>
          <div className="text-xs text-muted-foreground">
            {result.grams ? `${result.grams} g` : ""}
            {result.grams ? ` (${gramsToOunces(result.grams) ?? "?"} oz)` : ""}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="serving-notes">Notes (optional)</Label>
        <Textarea
          id="serving-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add preparation notes"
          rows={2}
        />
        <p className="text-xs text-muted-foreground">
          Database serving: {item.serving.text || `${item.serving.qty ?? "?"} ${item.serving.unit ?? "unit"}`} ·
          approx {servingWeight ? `${servingWeight} g / ${gramsToOunces(servingWeight) ?? "?"} oz` : "weight unknown"}
        </p>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
        <Button
          type="button"
          onClick={submit}
          disabled={busy || quantity <= 0 || readOnly}
          title={readOnly ? "Demo mode: sign in to save" : undefined}
        >
          {readOnly ? "Demo only" : busy ? "Adding…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}
