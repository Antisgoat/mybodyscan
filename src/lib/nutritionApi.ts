import { nutritionSearch } from "@/lib/api/nutrition";

export async function nutritionSearchClient(query: string) {
  return nutritionSearch(query);
}
