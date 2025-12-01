import { searchNutrition } from "@/lib/api/nutrition";

export async function nutritionSearchClient(query: string) {
  return searchNutrition(query);
}
