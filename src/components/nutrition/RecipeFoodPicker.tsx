import { useEffect, useRef, useState } from "react";
import { nutritionSearch } from "@/lib/api/nutrition";
import type { FoodItem } from "@/lib/nutrition/types";
import type { MeasuredIngredient } from "@/lib/nutrition/recipeTotals";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FoodSearchRow } from "./FoodSearchRow";
import { ServingEditor } from "./ServingEditor";
import { useWholeFoodChoices, WholeFoodWeightFilter } from "./WholeFoodChoices";

export function RecipeFoodPicker({
  name,
  onConfirm,
  onCancel,
}: {
  name: string;
  onConfirm: (ingredient: MeasuredIngredient) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState(name);
  const [results, setResults] = useState<FoodItem[]>([]);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = useRef(0);
  const { visibleFoods, weightFilter } = useWholeFoodChoices(results);
  useEffect(
    () => () => {
      active.current++;
    },
    []
  );
  const search = async () => {
    const request = ++active.current;
    setBusy(true);
    setError(null);
    setResults([]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const response = await Promise.race([
        nutritionSearch(query.trim(), { pageSize: 20 }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Search timed out. Try again.")),
            20_000
          );
        }),
      ]);
      if (active.current !== request) return;
      setResults(response.results);
      if (response.status !== "ok")
        setError("The food database is temporarily unavailable. Try again.");
      else if (!response.results.length)
        setError(
          "No matches. Try a simpler food name or add a label food in My Foods."
        );
    } catch {
      if (active.current === request)
        setError(
          "Could not search foods. Check your connection and try again."
        );
    } finally {
      clearTimeout(timer);
      if (active.current === request) setBusy(false);
    }
  };
  return (
    <section
      className="space-y-4 rounded-xl border p-3"
      aria-label={`Measure ${name}`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">Measure {name}</p>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Back
        </Button>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        Choose the food and raw/cooked state that match what you weigh. Include
        oils, dressings, and sauces.
      </p>
      {selected ? (
        <ServingEditor
          item={selected}
          confirmLabel="Use this portion"
          onCancel={() => setSelected(null)}
          onConfirm={({ qty, unit }) =>
            onConfirm({ item: selected, qty, unit })
          }
        />
      ) : (
        <>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && query.trim()) void search();
            }}
          >
            <Input
              className="min-w-0"
              aria-label="Recipe food search"
              value={query}
              maxLength={120}
              onChange={(event) => {
                active.current++;
                setBusy(false);
                setResults([]);
                setError(null);
                setQuery(event.target.value);
              }}
            />
            <Button type="submit" disabled={busy || !query.trim()}>
              {busy ? "Searching…" : "Search"}
            </Button>
          </form>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {weightFilter ? (
            <WholeFoodWeightFilter
              {...weightFilter}
              onChange={weightFilter.onChange}
            />
          ) : null}
          <div className="divide-y">
            {visibleFoods.slice(0, 8).map((item) => (
              <FoodSearchRow
                key={item.id}
                item={item}
                onSelect={() => setSelected(item)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
