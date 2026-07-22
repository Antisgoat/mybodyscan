import type { FoodItem } from "@/lib/nutrition/types";
import {
  deriveProductInsight,
  type ProductInsight,
} from "@/lib/productInsight";

export type ProductAlternative = {
  item: FoodItem;
  insight: ProductInsight;
  scoreDifference: number;
  sharedCategory: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function productRecord(item: unknown): Record<string, unknown> {
  const outer = record(item);
  const raw = record(outer.raw);
  return Object.keys(record(raw.raw)).length ? record(raw.raw) : raw;
}

export function extractProductCategories(item: unknown): string[] {
  const product = productRecord(item);
  const rawCategories = Array.isArray(product.categories_tags_en)
    ? product.categories_tags_en
    : Array.isArray(product.categories_tags)
      ? product.categories_tags
      : [];
  return Array.from(
    new Set(
      rawCategories
        .map((value) =>
          String(value)
            .replace(/^[a-z]{2}:/i, "")
            .replace(/[-_]+/g, " ")
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
    )
  );
}

export function deriveProductAlternatives(
  current: FoodItem,
  candidates: FoodItem[]
): ProductAlternative[] {
  const currentInsight = deriveProductInsight(current);
  if (currentInsight.score == null) return [];
  const currentCategories = extractProductCategories(current);
  if (!currentCategories.length) return [];
  const currentId = String(current.id || "");

  return candidates
    .map((candidate): ProductAlternative | null => {
      if (!candidate || String(candidate.id || "") === currentId) return null;
      const categories = extractProductCategories(candidate);
      const sharedCategory = [...currentCategories]
        .reverse()
        .find((category) => categories.includes(category));
      if (!sharedCategory) return null;
      const insight = deriveProductInsight(candidate);
      if (insight.score == null || insight.score <= currentInsight.score!) {
        return null;
      }
      return {
        item: candidate,
        insight,
        scoreDifference: insight.score - currentInsight.score!,
        sharedCategory,
      };
    })
    .filter((value): value is ProductAlternative => value != null)
    .sort(
      (a, b) =>
        b.insight.score! - a.insight.score! ||
        a.item.name.localeCompare(b.item.name)
    )
    .slice(0, 3);
}
