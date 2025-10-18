export type NutritionSource = "USDA" | "Open Food Facts";

export interface MacroBreakdown {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ServingOption {
  id: string;
  label: string;
  grams: number;
  isDefault?: boolean;
}

export interface ServingInfo {
  qty: number | null;
  unit: string | null;
  text?: string | null;
}

export interface ServingMacros {
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  source: NutritionSource;
  basePer100g: MacroBreakdown;
  servings: ServingOption[];
  serving: ServingInfo;
  per_serving: ServingMacros;
  per_100g?: ServingMacros | null;
  fdcId?: number;
  gtin?: string;
  raw?: unknown;
}
