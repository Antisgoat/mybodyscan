import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthUser } from "@/auth/mbs-auth";
import { useToast } from "@/hooks/use-toast";
import {
  MAJOR_ALLERGENS,
  allergenLabel,
  type MajorAllergen,
} from "@/lib/nutrition/allergens";
import {
  buildCustomFoodItem,
  deleteCustomFood,
  deleteRecipe,
  saveCustomFood,
  saveRecipe,
  subscribeCustomFoods,
  subscribeFavorites,
  subscribeRecipes,
  type CustomFoodDocWithId,
  type FavoriteDocWithId,
  type RecipeDocWithId,
  type RecipeIngredient,
} from "@/lib/nutritionCollections";
import {
  availableServingUnits,
  calculateSelection,
  type ServingUnit,
} from "@/lib/nutritionMath";
import type { FoodItem } from "@/lib/nutrition/types";

type NumericField = "calories" | "protein" | "carbs" | "fat";

function parseNumber(value: string): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function macroSummary(item: FoodItem) {
  const serving = calculateSelection(item, 1, "serving");
  return `${Math.round(serving.calories ?? 0)} kcal · P ${Math.round(
    serving.protein ?? 0
  )} g · C ${Math.round(serving.carbs ?? 0)} g · F ${Math.round(
    serving.fat ?? 0
  )} g`;
}

function AllergenPicker({
  selected,
  onChange,
}: {
  selected: MajorAllergen[];
  onChange: (next: MajorAllergen[]) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Major allergens on label</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {MAJOR_ALLERGENS.map((allergen) => {
          const checked = selected.includes(allergen.id);
          return (
            <label
              key={allergen.id}
              className="flex min-h-11 items-center gap-2 rounded-md border p-2 text-sm"
            >
              <Checkbox
                checked={checked}
                onCheckedChange={(value) =>
                  onChange(
                    value === true
                      ? [...selected, allergen.id]
                      : selected.filter((item) => item !== allergen.id)
                  )
                }
              />
              {allergen.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function FoodBuilder() {
  const { user } = useAuthUser();
  const uid = user?.uid ?? null;
  const { toast } = useToast();
  const [customFoods, setCustomFoods] = useState<CustomFoodDocWithId[]>([]);
  const [favorites, setFavorites] = useState<FavoriteDocWithId[]>([]);
  const [recipes, setRecipes] = useState<RecipeDocWithId[]>([]);
  const [busy, setBusy] = useState(false);
  const [food, setFood] = useState({
    name: "",
    brand: "",
    servingQty: "1",
    servingUnit: "serving",
    servingGrams: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    allergens: [] as MajorAllergen[],
    labelVerified: false,
  });
  const [recipe, setRecipe] = useState({
    name: "",
    servings: "4",
    allergens: [] as MajorAllergen[],
  });
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [sourceQty, setSourceQty] = useState("1");
  const [sourceUnit, setSourceUnit] = useState<ServingUnit>("serving");

  useEffect(() => {
    if (!uid) return;
    const unsubscribers = [
      subscribeCustomFoods(setCustomFoods, uid),
      subscribeFavorites(setFavorites, uid),
      subscribeRecipes(setRecipes, uid),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [uid]);

  const availableItems = useMemo(() => {
    const byId = new Map<string, FoodItem>();
    customFoods.forEach((entry) => byId.set(entry.item.id, entry.item));
    favorites.forEach((entry) => byId.set(entry.item.id, entry.item));
    return Array.from(byId.values());
  }, [customFoods, favorites]);

  const chosenSource = useMemo(
    () => availableItems.find((item) => item.id === sourceId) ?? null,
    [availableItems, sourceId]
  );

  useEffect(() => {
    if (!chosenSource) return;
    const units = availableServingUnits(chosenSource);
    setSourceUnit(units[0] ?? "serving");
  }, [chosenSource]);

  const updateFoodNumber = (key: NumericField, value: string) => {
    setFood((current) => ({ ...current, [key]: value }));
  };

  const submitCustomFood = async () => {
    if (!uid) return;
    if (!food.labelVerified) {
      toast({
        title: "Check the package label",
        description:
          "Confirm the nutrition values and allergens before saving.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const item = buildCustomFoodItem({
        name: food.name,
        brand: food.brand,
        servingQty: parseNumber(food.servingQty) || 1,
        servingUnit: food.servingUnit,
        servingGrams: food.servingGrams ? parseNumber(food.servingGrams) : null,
        calories: parseNumber(food.calories),
        protein: parseNumber(food.protein),
        carbs: parseNumber(food.carbs),
        fat: parseNumber(food.fat),
      });
      await saveCustomFood(
        {
          item,
          allergens: food.allergens,
          labelVerified: true,
        },
        uid
      );
      setFood({
        name: "",
        brand: "",
        servingQty: "1",
        servingUnit: "serving",
        servingGrams: "",
        calories: "",
        protein: "",
        carbs: "",
        fat: "",
        allergens: [],
        labelVerified: false,
      });
      toast({ title: "Custom food saved", description: item.name });
    } catch (error) {
      toast({
        title: "Unable to save food",
        description:
          error instanceof Error ? error.message : "Check each label value.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const addIngredient = () => {
    if (!chosenSource) {
      toast({ title: "Choose a saved food first" });
      return;
    }
    const qty = parseNumber(sourceQty);
    if (qty <= 0) {
      toast({ title: "Ingredient quantity must be greater than zero" });
      return;
    }
    const selection = calculateSelection(chosenSource, qty, sourceUnit);
    if (
      selection.calories == null ||
      selection.protein == null ||
      selection.carbs == null ||
      selection.fat == null
    ) {
      toast({
        title: "Serving unavailable",
        description: "Choose a serving with complete nutrition values.",
        variant: "destructive",
      });
      return;
    }
    setIngredients((current) => [
      ...current,
      { item: chosenSource, qty, unit: sourceUnit },
    ]);
    const customSource = customFoods.find(
      (entry) => entry.item.id === chosenSource.id
    );
    if (customSource?.allergens.length) {
      setRecipe((current) => ({
        ...current,
        allergens: Array.from(
          new Set([...current.allergens, ...customSource.allergens])
        ),
      }));
    }
    setSourceQty("1");
  };

  const submitRecipe = async () => {
    if (!uid) return;
    setBusy(true);
    try {
      await saveRecipe(
        {
          name: recipe.name,
          servings: parseNumber(recipe.servings),
          ingredients,
          allergens: recipe.allergens,
        },
        uid
      );
      toast({ title: "Recipe saved", description: recipe.name });
      setRecipe({ name: "", servings: "4", allergens: [] });
      setIngredients([]);
    } catch (error) {
      toast({
        title: "Unable to save recipe",
        description:
          error instanceof Error ? error.message : "Check the recipe values.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <Seo
        title="My Foods - MyBodyScan"
        description="Create private label foods and recipes with transparent nutrition sources."
      />
      <main className="mx-auto max-w-4xl space-y-6 p-6">
        <header className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            <span className="text-sm font-semibold">
              Private nutrition tools
            </span>
          </div>
          <h1 className="text-3xl font-semibold">My foods & recipes</h1>
          <p className="text-sm text-muted-foreground">
            Save a product from its package label, combine saved foods into a
            recipe, and log it from your Diary.
          </p>
        </header>

        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Always verify the current label</AlertTitle>
          <AlertDescription>
            Manufacturer recipes, serving sizes, and cross-contact warnings can
            change. MyBodyScan cannot certify a food as allergen-free. Check the
            package and contact the manufacturer when uncertain.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Add from a nutrition label
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="custom-name">Food name</Label>
              <Input
                id="custom-name"
                value={food.name}
                maxLength={140}
                onChange={(event) =>
                  setFood((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Plain Greek yogurt"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-brand">Brand (optional)</Label>
              <Input
                id="custom-brand"
                value={food.brand}
                maxLength={120}
                onChange={(event) =>
                  setFood((current) => ({
                    ...current,
                    brand: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-serving-qty">Label serving</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="custom-serving-qty"
                  inputMode="decimal"
                  value={food.servingQty}
                  onChange={(event) =>
                    setFood((current) => ({
                      ...current,
                      servingQty: event.target.value,
                    }))
                  }
                  aria-label="Serving quantity"
                />
                <Input
                  value={food.servingUnit}
                  maxLength={40}
                  onChange={(event) =>
                    setFood((current) => ({
                      ...current,
                      servingUnit: event.target.value,
                    }))
                  }
                  placeholder="cup, bar, container"
                  aria-label="Serving unit"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-serving-grams">
                Serving weight in grams (optional)
              </Label>
              <Input
                id="custom-serving-grams"
                inputMode="decimal"
                value={food.servingGrams}
                onChange={(event) =>
                  setFood((current) => ({
                    ...current,
                    servingGrams: event.target.value,
                  }))
                }
                placeholder="170"
              />
              <p className="text-xs text-muted-foreground">
                Add grams only when the label states them; this unlocks g and oz
                logging.
              </p>
            </div>
            {(
              [
                ["calories", "Calories"],
                ["protein", "Protein (g)"],
                ["carbs", "Carbs (g)"],
                ["fat", "Fat (g)"],
              ] as const
            ).map(([key, label]) => (
              <div className="space-y-2" key={key}>
                <Label htmlFor={`custom-${key}`}>{label}</Label>
                <Input
                  id={`custom-${key}`}
                  inputMode="decimal"
                  value={food[key]}
                  onChange={(event) =>
                    updateFoodNumber(key, event.target.value)
                  }
                />
              </div>
            ))}
            <div className="sm:col-span-2">
              <AllergenPicker
                selected={food.allergens}
                onChange={(allergens) =>
                  setFood((current) => ({ ...current, allergens }))
                }
              />
            </div>
            <label className="flex min-h-11 items-center gap-2 rounded-md border p-3 text-sm sm:col-span-2">
              <Checkbox
                checked={food.labelVerified}
                onCheckedChange={(checked) =>
                  setFood((current) => ({
                    ...current,
                    labelVerified: checked === true,
                  }))
                }
              />
              I checked these values and allergens against the current package
              label.
            </label>
            <Button
              className="sm:col-span-2"
              onClick={submitCustomFood}
              disabled={busy || !uid}
            >
              Save custom food
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Build a recipe</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="recipe-name">Recipe name</Label>
                <Input
                  id="recipe-name"
                  value={recipe.name}
                  maxLength={140}
                  onChange={(event) =>
                    setRecipe((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Turkey chili"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="recipe-servings">Number of servings</Label>
                <Input
                  id="recipe-servings"
                  inputMode="numeric"
                  value={recipe.servings}
                  onChange={(event) =>
                    setRecipe((current) => ({
                      ...current,
                      servings: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_100px_150px_auto]">
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger aria-label="Saved ingredient">
                  <SelectValue placeholder="Choose saved food" />
                </SelectTrigger>
                <SelectContent>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                inputMode="decimal"
                value={sourceQty}
                onChange={(event) => setSourceQty(event.target.value)}
                aria-label="Ingredient quantity"
              />
              <Select
                value={sourceUnit}
                onValueChange={(value) => setSourceUnit(value as ServingUnit)}
                disabled={!chosenSource}
              >
                <SelectTrigger aria-label="Ingredient serving unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(chosenSource
                    ? availableServingUnits(chosenSource)
                    : ["serving"]
                  ).map((unit) => (
                    <SelectItem key={unit} value={unit}>
                      {unit}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                onClick={addIngredient}
                disabled={!chosenSource}
              >
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Add
              </Button>
            </div>
            {!availableItems.length ? (
              <p className="text-sm text-muted-foreground">
                Save a custom food or favorite a search result before building a
                recipe.
              </p>
            ) : null}
            <div className="space-y-2">
              {ingredients.map((ingredient, index) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                  key={`${ingredient.item.id}-${index}`}
                >
                  <div>
                    <p className="font-medium">{ingredient.item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ingredient.qty} {ingredient.unit} ·{" "}
                      {macroSummary(ingredient.item)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setIngredients((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index)
                      )
                    }
                    aria-label={`Remove ${ingredient.item.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </div>
            <AllergenPicker
              selected={recipe.allergens}
              onChange={(allergens) =>
                setRecipe((current) => ({ ...current, allergens }))
              }
            />
            <Button
              className="w-full"
              onClick={submitRecipe}
              disabled={busy || !uid || !ingredients.length}
            >
              Save recipe
            </Button>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Saved foods</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!customFoods.length ? (
                <p className="text-sm text-muted-foreground">
                  No custom foods yet.
                </p>
              ) : null}
              {customFoods.map((entry) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                  key={entry.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {macroSummary(entry.item)}
                    </p>
                    {entry.allergens.length ? (
                      <p className="text-xs text-amber-700">
                        Reported:{" "}
                        {entry.allergens.map(allergenLabel).join(", ")}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => uid && deleteCustomFood(entry.id, uid)}
                    aria-label={`Delete ${entry.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Saved recipes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {!recipes.length ? (
                <p className="text-sm text-muted-foreground">No recipes yet.</p>
              ) : null}
              {recipes.map((entry) => (
                <div
                  className="flex items-center justify-between gap-3 rounded-md border p-3"
                  key={entry.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{entry.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {macroSummary(entry.item)} · {entry.servings} servings
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => uid && deleteRecipe(entry.id, uid)}
                    aria-label={`Delete ${entry.name}`}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Button variant="outline" asChild>
          <Link to="/meals">Back to Diary</Link>
        </Button>
      </main>
    </div>
  );
}
