export type MacroNumbers = {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export function macroNumber(value: unknown): number {
  const n = typeof value === "string" && value.trim() === "" ? NaN : Number(value);
  return Number.isFinite(n) ? Number(n) : 0;
}

export function macrosToNumbers(value: unknown): MacroNumbers {
  const v = (value && typeof value === "object" ? (value as any) : {}) as any;
  return {
    kcal: macroNumber(v.kcal),
    protein_g: macroNumber(v.protein_g),
    carbs_g: macroNumber(v.carbs_g),
    fat_g: macroNumber(v.fat_g),
  };
}
