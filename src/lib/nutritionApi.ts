import { searchNutrition } from "@/lib/api/nutrition";

export async function nutritionSearchClient(query: string) {
  const result = await searchNutrition(query);
  return result.items;
}
