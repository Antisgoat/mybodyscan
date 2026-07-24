export type ProductInsightFactor = {
  key: string;
  label: string;
  detail: string;
  impact: number;
  kind: "positive" | "caution" | "neutral";
};

export type ProductInsight = {
  score: number | null;
  label: "Strong" | "Balanced" | "Mixed" | "Limited" | "Insufficient data";
  confidence: "high" | "medium" | "low";
  basis: "per 100 g";
  factors: ProductInsightFactor[];
  ingredients: string | null;
  ingredientHighlights: string[];
  additives: string[];
  allergens: string[];
  missing: string[];
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function finite(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function cleanTags(value: unknown): string[] {
  const values = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return Array.from(
    new Set(
      values
        .map((entry) =>
          String(entry)
            .replace(/^[a-z]{2}:/i, "")
            .replace(/[-_]+/g, " ")
            .trim()
        )
        .filter(Boolean)
    )
  ).slice(0, 12);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ingredientHighlights(ingredients: string | null): string[] {
  if (!ingredients) return [];
  const lower = ingredients.toLowerCase();
  const groups: Array<{ label: string; terms: string[] }> = [
    {
      label: "Seed-derived oil listed",
      terms: [
        "canola oil",
        "rapeseed oil",
        "soybean oil",
        "sunflower oil",
        "safflower oil",
        "corn oil",
        "cottonseed oil",
        "grapeseed oil",
        "rice bran oil",
      ],
    },
    {
      label: "Partially hydrogenated oil listed",
      terms: ["partially hydrogenated"],
    },
    {
      label: "Non-nutritive sweetener listed",
      terms: [
        "aspartame",
        "sucralose",
        "saccharin",
        "acesulfame potassium",
        "acesulfame k",
      ],
    },
  ];
  return groups
    .filter((group) => group.terms.some((term) => lower.includes(term)))
    .map((group) => group.label);
}

function penalty(value: number | null, reference: number, max: number): number {
  if (value == null) return 0;
  return -Math.round(clamp(value / reference, 0, 1) * max);
}

function bonus(value: number | null, reference: number, max: number): number {
  if (value == null) return 0;
  return Math.round(clamp(value / reference, 0, 1) * max);
}

export function deriveProductInsight(input: unknown): ProductInsight {
  const item = record(input);
  const outerRaw = record(item.raw);
  const product = Object.keys(record(outerRaw.raw)).length
    ? record(outerRaw.raw)
    : outerRaw;
  const nutriments = record(product.nutriments);
  const base = record(item.basePer100g);
  const normalizedBase = record(outerRaw.basePer100g);

  const nutrients = {
    kcal: finite(
      nutriments["energy-kcal_100g"],
      nutriments.energy_kcal_100g,
      base.kcal,
      normalizedBase.kcal
    ),
    protein: finite(nutriments.proteins_100g, base.protein, normalizedBase.protein),
    fiber: finite(nutriments.fiber_100g, nutriments.fibers_100g),
    saturatedFat: finite(nutriments["saturated-fat_100g"], nutriments.saturated_fat_100g),
    sodiumMg: (() => {
      const directMg = finite(nutriments.sodium_mg_100g);
      if (directMg != null) return directMg;
      const sodiumG = finite(nutriments.sodium_100g);
      if (sodiumG != null) return sodiumG * 1000;
      const saltG = finite(nutriments.salt_100g);
      return saltG == null ? null : saltG * 400;
    })(),
    addedSugar: finite(nutriments["added-sugars_100g"], nutriments.added_sugars_100g),
    totalSugar: finite(nutriments.sugars_100g),
    transFat: finite(nutriments["trans-fat_100g"], nutriments.trans_fat_100g),
  };

  const missing: string[] = [];
  if (nutrients.kcal == null) missing.push("calories");
  if (nutrients.saturatedFat == null) missing.push("saturated fat");
  if (nutrients.sodiumMg == null) missing.push("sodium");
  if (nutrients.addedSugar == null && nutrients.totalSugar == null) missing.push("sugars");
  if (nutrients.fiber == null) missing.push("fiber");

  const availableCore = 5 - missing.length;
  const ingredients =
    typeof product.ingredients_text === "string" && product.ingredients_text.trim()
      ? product.ingredients_text.trim()
      : null;
  const additives = cleanTags(product.additives_tags ?? product.additives);
  const allergens = cleanTags(product.allergens_tags ?? product.allergens);

  if (availableCore < 3) {
    return {
      score: null,
      label: "Insufficient data",
      confidence: "low",
      basis: "per 100 g",
      factors: [],
      ingredients,
      ingredientHighlights: ingredientHighlights(ingredients),
      additives,
      allergens,
      missing,
    };
  }

  const factors: ProductInsightFactor[] = [];
  const addFactor = (
    key: string,
    label: string,
    value: number | null,
    impact: number,
    unit: string,
    kind: ProductInsightFactor["kind"]
  ) => {
    if (value == null || impact === 0) return;
    factors.push({
      key,
      label,
      detail: `${Math.round(value * 10) / 10}${unit} per 100 g`,
      impact,
      kind,
    });
  };

  // Original MBS formula. References are deliberately published and use a
  // consistent 100 g comparison basis; they are not FDA nutrient-content claims.
  addFactor("fiber", "Dietary fiber", nutrients.fiber, bonus(nutrients.fiber, 7, 12), " g", "positive");
  addFactor("protein", "Protein", nutrients.protein, bonus(nutrients.protein, 20, 8), " g", "positive");
  addFactor(
    "saturated-fat",
    "Saturated fat",
    nutrients.saturatedFat,
    penalty(nutrients.saturatedFat, 10, 15),
    " g",
    "caution"
  );
  addFactor("sodium", "Sodium", nutrients.sodiumMg, penalty(nutrients.sodiumMg, 1150, 15), " mg", "caution");
  const sugar = nutrients.addedSugar ?? nutrients.totalSugar;
  addFactor(
    nutrients.addedSugar != null ? "added-sugar" : "total-sugar",
    nutrients.addedSugar != null ? "Added sugar" : "Total sugar",
    sugar,
    penalty(sugar, 25, 15),
    " g",
    "caution"
  );
  addFactor("trans-fat", "Trans fat", nutrients.transFat, penalty(nutrients.transFat, 2, 5), " g", "caution");

  const score = clamp(
    Math.round(80 + factors.reduce((total, factor) => total + factor.impact, 0)),
    0,
    100
  );
  const label = score >= 80 ? "Strong" : score >= 65 ? "Balanced" : score >= 45 ? "Mixed" : "Limited";

  return {
    score,
    label,
    confidence: availableCore === 5 && ingredients ? "high" : "medium",
    basis: "per 100 g",
    factors: factors.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)),
    ingredients,
    ingredientHighlights: ingredientHighlights(ingredients),
    additives,
    allergens,
    missing,
  };
}
