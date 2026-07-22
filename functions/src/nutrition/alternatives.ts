import { fromOpenFoodFacts, type FoodItem } from "../nutritionSearch.js";

const OFF_FIELDS = [
  "code",
  "product_name",
  "generic_name",
  "brands",
  "serving_quantity",
  "serving_size",
  "serving_size_unit",
  "nutriments",
  "ingredients_text",
  "additives_tags",
  "allergens_tags",
  "categories_tags",
  "categories_tags_en",
].join(",");

const USER_AGENT = "MyBodyScan/1.0 (https://mybodyscanapp.com)";
const TIMEOUT_MS = 8_000;

type ProductBundle = {
  item: FoodItem;
  alternatives: FoodItem[];
};

async function getJson(url: URL): Promise<any> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`off_status_${response.status}`);
  return response.json();
}

function cleanCategory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const category = value.trim();
  if (!category || category.length > 100) return null;
  return category;
}

function mostSpecificCategory(product: any): string | null {
  const english = Array.isArray(product?.categories_tags_en)
    ? product.categories_tags_en
    : [];
  const canonical = Array.isArray(product?.categories_tags)
    ? product.categories_tags
    : [];
  const values = english.length ? english : canonical;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const category = cleanCategory(values[index]);
    if (category) return category.replace(/^[a-z]{2}:/i, "");
  }
  return null;
}

async function fetchCandidates(
  product: any,
  code: string
): Promise<FoodItem[]> {
  const category = mostSpecificCategory(product);
  if (!category) return [];
  const url = new URL("https://world.openfoodfacts.org/api/v2/search");
  url.searchParams.set("categories_tags_en", category);
  url.searchParams.set("fields", OFF_FIELDS);
  url.searchParams.set("page_size", "24");
  const data = await getJson(url);
  if (!Array.isArray(data?.products)) return [];
  const seen = new Set<string>([code]);
  const results: FoodItem[] = [];
  for (const candidate of data.products) {
    const normalized = fromOpenFoodFacts(candidate);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    results.push(normalized);
    if (results.length >= 12) break;
  }
  return results;
}

export async function fetchOpenFoodFactsBundle(
  code: string
): Promise<ProductBundle | null> {
  const url = new URL(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
  );
  url.searchParams.set("fields", OFF_FIELDS);
  const data = await getJson(url);
  const product = data?.product;
  if (!product) return null;
  const item = fromOpenFoodFacts(product);
  if (!item) return null;
  let alternatives: FoodItem[] = [];
  try {
    alternatives = await fetchCandidates(product, code);
  } catch (error) {
    console.warn("nutrition_alternatives_failed", {
      code,
      message: error instanceof Error ? error.message : String(error),
    });
  }
  return { item, alternatives };
}
