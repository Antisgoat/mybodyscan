export type ServingOption = {
  id: string;
  label: string;
  grams: number;
  isDefault?: boolean;
};

export type FoodNormalized = {
  id: string;
  name: string;
  brand?: string | null;
  source: "USDA" | "Open Food Facts" | "OFF";
  basePer100g: { kcal: number; protein: number; carbs: number; fat: number };
  servings: ServingOption[];
};

function round(value: number, decimals = 0) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function ensurePositive(num: number | null | undefined): number | null {
  if (num === null || num === undefined) return null;
  return num > 0 ? num : null;
}

function makeId(prefix: string, index: number, suffix: string) {
  return `${prefix}-${index}-${suffix}`;
}

function formatLabel(parts: (string | number | null | undefined)[]) {
  return parts
    .map((part) => {
      if (part === null || part === undefined) return "";
      if (typeof part === "string") return part.trim();
      if (typeof part === "number") {
        const rounded = Number.isInteger(part)
          ? part.toString()
          : part.toFixed(2);
        return rounded.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
      }
      return "";
    })
    .filter((part) => part.length > 0)
    .join(" ");
}

function convertToGrams(
  quantity: number | null | undefined,
  unit: string | null | undefined
): number | null {
  if (!quantity || quantity <= 0) return null;
  if (!unit) return null;
  const normalized = unit.trim().toLowerCase();
  switch (normalized) {
    case "g":
    case "gram":
    case "grams":
      return quantity;
    case "kg":
    case "kilogram":
    case "kilograms":
      return quantity * 1000;
    case "oz":
    case "ounce":
    case "ounces":
      return quantity * 28.3495231;
    case "lb":
    case "lbs":
    case "pound":
    case "pounds":
      return quantity * 453.59237;
    case "ml":
    case "milliliter":
    case "milliliters":
      return quantity;
    case "l":
    case "liter":
    case "liters":
      return quantity * 1000;
    default:
      return null;
  }
}

function addServingOption(
  servings: ServingOption[],
  option: ServingOption,
  seen: Map<string, ServingOption>,
  _isDefault?: boolean
) {
  const gramsKey = round(option.grams, 3).toString();
  const key = `${option.label.toLowerCase()}-${gramsKey}`;
  if (seen.has(key)) return;
  seen.set(key, option);
  servings.push(option);
}

function ensureBasePer100g(
  values: Partial<FoodNormalized["basePer100g"]>
): FoodNormalized["basePer100g"] {
  return {
    kcal: round(values.kcal ?? 0, 0),
    protein: round(values.protein ?? 0, 1),
    carbs: round(values.carbs ?? 0, 1),
    fat: round(values.fat ?? 0, 1),
  };
}

function buildBaseFromLabel(
  label: any,
  servingGrams: number | null,
  fallback: Partial<FoodNormalized["basePer100g"]>
) {
  if (!servingGrams || servingGrams <= 0) {
    return ensureBasePer100g(fallback);
  }
  const factor = 100 / servingGrams;
  const base = { ...fallback };
  const calories = toNumber(label?.calories?.value ?? label?.calories);
  if (calories !== null) base.kcal = round(calories * factor, 0);
  const protein = toNumber(label?.protein?.value ?? label?.protein);
  if (protein !== null) base.protein = round(protein * factor, 1);
  const carbs = toNumber(label?.carbohydrates?.value ?? label?.carbohydrates);
  if (carbs !== null) base.carbs = round(carbs * factor, 1);
  const fat = toNumber(label?.fat?.value ?? label?.fat);
  if (fat !== null) base.fat = round(fat * factor, 1);
  return ensureBasePer100g(base);
}

export function fromUSDA(raw: any): FoodNormalized {
  const servings: ServingOption[] = [];
  const seen = new Map<string, ServingOption>();
  addServingOption(
    servings,
    { id: "100g", label: "100 g", grams: 100, isDefault: true },
    seen
  );

  const portions = Array.isArray(raw?.foodPortions) ? raw.foodPortions : [];
  const sortedPortions = portions
    .filter(
      (portion: any) => ensurePositive(toNumber(portion?.gramWeight)) !== null
    )
    .sort((a: any, b: any) => {
      const aSeq = toNumber(a?.sequenceNumber) ?? 0;
      const bSeq = toNumber(b?.sequenceNumber) ?? 0;
      return aSeq - bSeq;
    });

  sortedPortions.forEach((portion: any, index: number) => {
    const grams = ensurePositive(toNumber(portion?.gramWeight));
    if (!grams) return;
    const amount = toNumber(portion?.amount) ?? 1;
    const modifier =
      typeof portion?.modifier === "string" ? portion.modifier.trim() : "";
    const description =
      typeof portion?.portionDescription === "string"
        ? portion.portionDescription.trim()
        : "";
    const measureUnit = portion?.measureUnit;
    const measureName =
      typeof measureUnit?.name === "string" ? measureUnit.name.trim() : "";
    const measureAbbr =
      typeof measureUnit?.abbreviation === "string"
        ? measureUnit.abbreviation.trim()
        : "";

    const label = formatLabel([
      amount !== 1 ? amount : null,
      description || modifier || measureAbbr || measureName || "serving",
    ]);

    addServingOption(
      servings,
      {
        id: makeId("usda", index, grams.toFixed(2)),
        label: label || `${round(amount ?? 1, 2)} serving`,
        grams,
      },
      seen
    );
  });

  if (servings.length === 1) {
    const servingSize = ensurePositive(toNumber(raw?.servingSize));
    const servingUnit =
      typeof raw?.servingSizeUnit === "string" ? raw.servingSizeUnit : null;
    const grams = convertToGrams(servingSize, servingUnit);
    if (grams) {
      const labelText =
        typeof raw?.householdServingFullText === "string" &&
        raw.householdServingFullText.trim().length
          ? raw.householdServingFullText.trim()
          : formatLabel([servingSize, servingUnit]);
      addServingOption(
        servings,
        {
          id: makeId("usda-default", 0, grams.toFixed(2)),
          label: labelText || `${servingSize} ${servingUnit ?? "serving"}`,
          grams,
        },
        seen
      );
    }
  }

  const baseFallback: Partial<FoodNormalized["basePer100g"]> = {};
  const nutrients = Array.isArray(raw?.foodNutrients) ? raw.foodNutrients : [];
  const findNutrient = (name: string, unit?: string) => {
    const match = nutrients.find((n: any) => {
      const nutrientName =
        typeof n?.nutrientName === "string" ? n.nutrientName.toLowerCase() : "";
      if (!nutrientName) return false;
      if (!nutrientName.includes(name.toLowerCase())) return false;
      if (unit) {
        const unitName =
          typeof n?.unitName === "string" ? n.unitName.toLowerCase() : "";
        return unitName === unit.toLowerCase();
      }
      return true;
    });
    return match ? toNumber(match.value ?? match.amount) : null;
  };

  const energy100 = ensurePositive(findNutrient("energy", "kcal"));
  if (energy100 !== null) baseFallback.kcal = round(energy100, 0);
  const protein100 = ensurePositive(findNutrient("protein"));
  if (protein100 !== null) baseFallback.protein = round(protein100, 1);
  const carbs100 = ensurePositive(findNutrient("carbohydrate"));
  if (carbs100 !== null) baseFallback.carbs = round(carbs100, 1);
  const fat100 = ensurePositive(findNutrient("fat"));
  if (fat100 !== null) baseFallback.fat = round(fat100, 1);

  const servingSize = ensurePositive(toNumber(raw?.servingSize));
  const servingUnit =
    typeof raw?.servingSizeUnit === "string" ? raw.servingSizeUnit : null;
  const servingGrams = convertToGrams(servingSize, servingUnit);
  const basePer100g = buildBaseFromLabel(
    raw?.labelNutrients ?? raw?.labelNutrientsOld ?? {},
    servingGrams,
    baseFallback
  );

  return {
    id: raw?.fdcId ? `usda-${raw.fdcId}` : String(raw?.id ?? "usda-food"),
    name:
      typeof raw?.description === "string" && raw.description.trim().length
        ? raw.description.trim()
        : "USDA Food",
    brand:
      typeof raw?.brandOwner === "string" && raw.brandOwner.trim().length
        ? raw.brandOwner.trim()
        : typeof raw?.brandName === "string" && raw.brandName.trim().length
          ? raw.brandName.trim()
          : null,
    source: "USDA",
    basePer100g,
    servings,
  };
}

export function fromSearchItem(data: {
  id: string;
  name: string;
  brand?: string | null;
  source: "USDA" | "OFF";
  basePer100g?: Partial<FoodNormalized["basePer100g"]> | null;
  servings?: ServingOption[] | null;
}): FoodNormalized {
  const basePer100g = ensureBasePer100g(data.basePer100g ?? {});
  const servings: ServingOption[] = [];
  const seen = new Map<string, ServingOption>();

  if (Array.isArray(data.servings)) {
    data.servings.forEach((option, index) => {
      const grams = ensurePositive(option?.grams);
      if (!grams) return;
      const label =
        typeof option?.label === "string" && option.label.trim().length
          ? option.label.trim()
          : `${round(grams, 2)} g`;
      addServingOption(
        servings,
        {
          id: option?.id || makeId("srv", index, grams.toFixed(2)),
          label,
          grams,
          isDefault: option?.isDefault,
        },
        seen,
        Boolean(option?.isDefault)
      );
    });
  }

  if (!servings.some((option) => Math.abs(option.grams - 100) < 0.001)) {
    addServingOption(
      servings,
      {
        id: "100g",
        label: "100 g",
        grams: 100,
        isDefault: servings.length === 0,
      },
      seen,
      servings.length === 0
    );
  }

  if (!servings.some((option) => option.isDefault)) {
    if (servings.length) {
      servings[0].isDefault = true;
    } else {
      addServingOption(
        servings,
        { id: "100g", label: "100 g", grams: 100, isDefault: true },
        seen,
        true
      );
    }
  }

  return {
    id: data.id,
    name: data.name || "Food",
    brand: data.brand ?? null,
    source: data.source,
    basePer100g,
    servings,
  };
}

function parseOffServingSize(
  raw: any
): { label: string; grams: number } | null {
  const quantity = ensurePositive(toNumber(raw?.serving_quantity));
  const unit =
    typeof raw?.serving_size_unit === "string" ? raw.serving_size_unit : null;
  let grams = convertToGrams(quantity, unit);
  let label: string | null = null;

  if (typeof raw?.serving_size === "string" && raw.serving_size.trim().length) {
    label = raw.serving_size.trim();
    if (!grams) {
      const match = raw.serving_size.match(/([\d.,]+)\s*(g|ml|oz|kg|l|lb)/i);
      if (match) {
        grams = convertToGrams(toNumber(match[1]), match[2]);
      }
    }
  }

  if (!grams && quantity && unit) {
    grams = convertToGrams(quantity, unit);
  }

  if (!grams) return null;

  return {
    label: label || formatLabel([quantity ?? 1, unit ?? "serving"]),
    grams,
  };
}

export function fromOFF(raw: any): FoodNormalized {
  const servings: ServingOption[] = [];
  const seen = new Map<string, ServingOption>();
  addServingOption(
    servings,
    { id: "100g", label: "100 g", grams: 100, isDefault: true },
    seen
  );

  const parsedServing = parseOffServingSize(raw);
  if (parsedServing) {
    addServingOption(
      servings,
      {
        id: makeId("off", 0, parsedServing.grams.toFixed(2)),
        label: parsedServing.label,
        grams: parsedServing.grams,
      },
      seen
    );
  }

  const nutriments = raw?.nutriments ?? {};
  const energyPer100 =
    ensurePositive(toNumber(nutriments["energy-kcal_100g"])) ??
    ensurePositive(
      toNumber(nutriments.energy_100g ? nutriments.energy_100g / 4.184 : null)
    );
  const basePer100g = ensureBasePer100g({
    kcal: energyPer100 ?? undefined,
    protein: ensurePositive(toNumber(nutriments.proteins_100g)) ?? undefined,
    carbs: ensurePositive(toNumber(nutriments.carbohydrates_100g)) ?? undefined,
    fat: ensurePositive(toNumber(nutriments.fat_100g)) ?? undefined,
  });

  return {
    id: raw?.id ? `off-${raw.id}` : raw?.code ? `off-${raw.code}` : "off-food",
    name:
      typeof raw?.product_name === "string" && raw.product_name.trim().length
        ? raw.product_name.trim()
        : typeof raw?.generic_name === "string" &&
            raw.generic_name.trim().length
          ? raw.generic_name.trim()
          : "Food",
    brand:
      typeof raw?.brands === "string" && raw.brands.trim().length
        ? raw.brands.trim()
        : typeof raw?.brand_owner === "string" && raw.brand_owner.trim().length
          ? raw.brand_owner.trim()
          : null,
    source: "Open Food Facts",
    basePer100g,
    servings,
  };
}

export function calcMacrosFromGrams(
  base: FoodNormalized["basePer100g"] | null | undefined,
  grams: number
): { kcal: number; protein: number; carbs: number; fat: number } {
  const safeGrams = grams > 0 ? grams : 0;
  const factor = safeGrams / 100;
  // Guardrail: upstream/legacy callers may pass an incomplete `FoodNormalized`.
  // This function is called during render (ServingChooser), so it must never throw.
  const kcal = Number((base as any)?.kcal);
  const protein = Number((base as any)?.protein);
  const carbs = Number((base as any)?.carbs);
  const fat = Number((base as any)?.fat);
  return {
    kcal: round((Number.isFinite(kcal) ? kcal : 0) * factor, 0),
    protein: round((Number.isFinite(protein) ? protein : 0) * factor, 1),
    carbs: round((Number.isFinite(carbs) ? carbs : 0) * factor, 1),
    fat: round((Number.isFinite(fat) ? fat : 0) * factor, 1),
  };
}
