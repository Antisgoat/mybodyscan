import { useState } from "react";
import type { FoodItem } from "@/lib/nutrition/types";

type WeightState = "raw" | "cooked";
export function useWholeFoodChoices(items: FoodItem[]) {
  const [selection, setSelection] = useState<{
    key: string;
    state: WeightState;
  } | null>(null);
  const isWholeFoodList =
    items.length > 0 && items.every((item) => item.wholeFood);
  const key = items.map((item) => item.id).join("|");
  const hasRaw = items.some((item) => item.wholeFood?.preparation === "raw");
  const hasCooked = items.some(
    (item) => item.wholeFood?.preparation === "cooked"
  );
  const canChooseWeight = isWholeFoodList && hasRaw && hasCooked;
  const state =
    selection?.key === key ? selection.state : hasRaw ? "raw" : "cooked";
  return {
    isWholeFoodList,
    visibleFoods: canChooseWeight
      ? items.filter((item) => item.wholeFood?.preparation === state)
      : items,
    weightFilter: canChooseWeight
      ? {
          state,
          onChange: (state: WeightState) => setSelection({ key, state }),
        }
      : null,
  };
}

export function WholeFoodWeightFilter({
  state,
  onChange,
}: {
  state: WeightState;
  onChange: (value: WeightState) => void;
}) {
  return (
    <fieldset className="space-y-2 rounded-2xl bg-secondary/40 p-3">
      <legend className="sr-only">Food weight state</legend>
      <p className="text-xs font-medium text-muted-foreground">
        Match how you weighed it
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(["raw", "cooked"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={state === value}
            onClick={() => onChange(value)}
            className={`min-h-11 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${state === value ? "border-primary/20 bg-primary/10 text-primary" : "border-transparent bg-background text-muted-foreground hover:text-foreground"}`}
          >
            {value === "raw" ? "Raw weight" : "Cooked weight"}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
