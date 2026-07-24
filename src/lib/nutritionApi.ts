import { nutritionSearch } from "@/lib/api/nutrition";

export async function nutritionSearchClient(
  query: string,
  options?: {
    page?: number;
    pageSize?: number;
    sourcePreference?: "usda-first" | "off-first" | "combined";
  }
) {
  return nutritionSearch(query, options);
}
