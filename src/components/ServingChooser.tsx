import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FoodNormalized, ServingOption } from "@/lib/nutrition/measureMap";
import { calcMacrosFromGrams } from "@/lib/nutrition/measureMap";

interface ServingChooserProps {
  food: FoodNormalized;
  onConfirm: (payload: {
    grams: number;
    label: string;
    quantity: number;
  }) => void;
  onClose: () => void;
}

export function ServingChooser({
  food,
  onConfirm,
  onClose,
}: ServingChooserProps) {
  const defaultServing = useMemo(() => {
    if (!food.servings.length) {
      return undefined;
    }
    return (
      food.servings.find((serving) => serving.isDefault) ?? food.servings[0]
    );
  }, [food.servings]);

  const [quantity, setQuantity] = useState<number>(1);
  const [servingId, setServingId] = useState<string | undefined>(
    defaultServing?.id
  );
  const quantityRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQuantity(1);
    setServingId(defaultServing?.id);
  }, [food, defaultServing?.id]);

  const selectedServing: ServingOption | undefined = useMemo(() => {
    if (!servingId) return defaultServing;
    return (
      food.servings.find((option) => option.id === servingId) ?? defaultServing
    );
  }, [defaultServing, food.servings, servingId]);

  const grams = useMemo(() => {
    if (!selectedServing) return 0;
    const total = quantity * selectedServing.grams;
    return total > 0 ? Number(total.toFixed(2)) : 0;
  }, [quantity, selectedServing]);

  const macros = useMemo(
    () => calcMacrosFromGrams(food.basePer100g, grams),
    [food.basePer100g, grams]
  );

  const confirm = () => {
    if (!selectedServing) return;
    if (quantity < 0.25) return;
    onConfirm({ grams, label: selectedServing.label, quantity });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          window.requestAnimationFrame(() => quantityRef.current?.focus());
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          onClose();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-1">
            <span>{food.name}</span>
            {food.brand && (
              <span className="text-sm font-normal text-muted-foreground">
                {food.brand}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>Choose a serving size and quantity before adding this item.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="serving-quantity">Quantity</Label>
              <Input
                id="serving-quantity"
                ref={quantityRef}
                type="number"
                min={0.25}
                step={0.25}
                value={quantity}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (!Number.isFinite(value)) {
                    setQuantity(0.25);
                    return;
                  }
                  setQuantity(value < 0.25 ? 0.25 : value);
                }}
              />
            </div>
            <div>
              <Label htmlFor="serving-unit">Unit</Label>
              <Select
                value={selectedServing?.id ?? food.servings[0]?.id ?? ""}
                onValueChange={(value) => setServingId(value)}
              >
                <SelectTrigger id="serving-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {food.servings.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Total weight</Label>
              <p className="text-lg font-semibold">
                {grams ? `${grams} g` : "—"}
              </p>
            </div>
            <div>
              <Label>Macros</Label>
              <p className="text-sm text-muted-foreground">
                {macros.kcal} kcal • {macros.protein}g P • {macros.carbs}g C •{" "}
                {macros.fat}g F
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirm}
              disabled={!selectedServing || quantity < 0.25}
            >
              Add
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
