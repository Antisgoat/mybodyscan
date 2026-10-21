import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import type { FoodItem } from "@/lib/nutrition/types";
import { calculateSelection } from "@/lib/nutritionMath";

export function foodLabel(value: string): string {
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean || clean !== clean.toUpperCase()) return clean || "Food";
  return clean
    .toLowerCase()
    .replace(
      /(^|[\s\-/])([a-z])/g,
      (_, start: string, letter: string) => `${start}${letter.toUpperCase()}`
    );
}

export function nutritionNumber(value?: number | null, whole = false): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: whole ? 0 : 1,
  }).format(value);
}

export function FoodMacroSummary({
  calories,
  protein,
  carbs,
  fat,
}: {
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}) {
  return (
    <div
      className="grid grid-cols-4 divide-x divide-border/70 rounded-2xl bg-secondary/60 py-4 text-center"
      aria-label="Nutrition for selected portion"
    >
      {[
        {
          label: "Calories",
          value: nutritionNumber(calories, true),
          unit: "kcal",
          color: "text-foreground",
        },
        {
          label: "Protein",
          value: nutritionNumber(protein),
          unit: "g",
          color: "text-sky-700 dark:text-sky-300",
        },
        {
          label: "Carbs",
          value: nutritionNumber(carbs),
          unit: "g",
          color: "text-teal-700 dark:text-teal-300",
        },
        {
          label: "Fat",
          value: nutritionNumber(fat),
          unit: "g",
          color: "text-amber-700 dark:text-amber-300",
        },
      ].map(({ label, value, unit, color }) => (
        <div key={label} className="min-w-0 px-1">
          <p
            className={`text-lg font-semibold tabular-nums sm:text-xl ${color}`}
          >
            {value}
            <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">
              {unit}
            </span>
          </p>
          <p className="mt-1 text-[11px] font-medium text-muted-foreground">
            {label}
          </p>
        </div>
      ))}
    </div>
  );
}

export function FoodSearchRow({
  item,
  onSelect,
  disabled,
  favoriteAction,
}: {
  item: FoodItem;
  onSelect: () => void;
  disabled?: boolean;
  favoriteAction?: ReactNode;
}) {
  const serving = calculateSelection(item, 1, "serving");
  const hasServing = [
    serving.calories,
    serving.protein,
    serving.carbs,
    serving.fat,
  ].some((value) => value != null);
  const values = hasServing
    ? serving
    : {
        calories: item.basePer100g?.kcal ?? item.per_100g?.kcal,
        protein: item.basePer100g?.protein ?? item.per_100g?.protein_g,
        carbs: item.basePer100g?.carbs ?? item.per_100g?.carbs_g,
        fat: item.basePer100g?.fat ?? item.per_100g?.fat_g,
      };
  const portion = hasServing ? item.serving.text || "1 serving" : "100 g";
  return (
    <div
      className="flex min-w-0 items-center gap-2 py-4 sm:gap-3"
      data-testid="food-search-row"
    >
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="group min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        aria-label={`Review ${foodLabel(item.name)}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 break-words text-[15px] font-semibold leading-5 text-foreground group-hover:text-primary">
              {foodLabel(item.name)}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {portion}
              {item.brand ? ` · ${foodLabel(item.brand)}` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-semibold leading-5 tabular-nums text-foreground">
              {nutritionNumber(values.calories, true)}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">kcal</p>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:text-xs">
          <span>
            <span className="font-medium text-sky-700 dark:text-sky-300">
              Protein
            </span>{" "}
            {nutritionNumber(values.protein)}g
          </span>
          <span>
            <span className="font-medium text-teal-700 dark:text-teal-300">
              Carbs
            </span>{" "}
            {nutritionNumber(values.carbs)}g
          </span>
          <span>
            <span className="font-medium text-amber-700 dark:text-amber-300">
              Fat
            </span>{" "}
            {nutritionNumber(values.fat)}g
          </span>
        </div>
      </button>
      {favoriteAction}
      <button
        type="button"
        onClick={onSelect}
        disabled={disabled}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        aria-label={`Add ${foodLabel(item.name)}`}
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
