export const MAJOR_ALLERGENS = [
  { id: "milk", label: "Milk" },
  { id: "egg", label: "Egg" },
  { id: "fish", label: "Fish" },
  { id: "crustacean_shellfish", label: "Crustacean shellfish" },
  { id: "tree_nuts", label: "Tree nuts" },
  { id: "peanuts", label: "Peanuts" },
  { id: "wheat", label: "Wheat" },
  { id: "soy", label: "Soy" },
  { id: "sesame", label: "Sesame" },
] as const;

export type MajorAllergen = (typeof MAJOR_ALLERGENS)[number]["id"];

export function allergenLabel(id: string): string {
  return MAJOR_ALLERGENS.find((allergen) => allergen.id === id)?.label ?? id;
}

export function normalizeAllergens(values: unknown): MajorAllergen[] {
  if (!Array.isArray(values)) return [];
  const allowed = new Set<string>(
    MAJOR_ALLERGENS.map((allergen) => allergen.id)
  );
  return Array.from(
    new Set(
      values.filter(
        (value): value is MajorAllergen =>
          typeof value === "string" && allowed.has(value)
      )
    )
  );
}
