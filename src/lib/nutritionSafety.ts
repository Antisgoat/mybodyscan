import { MAJOR_ALLERGENS, type MajorAllergen } from "@/lib/nutrition/allergens";

const MATCH_TERMS: Record<MajorAllergen, string[]> = {
  milk: ["milk", "dairy", "lactose", "casein", "whey"],
  egg: ["egg", "eggs"],
  fish: ["fish"],
  crustacean_shellfish: [
    "crustacean",
    "shellfish",
    "shrimp",
    "prawn",
    "crab",
    "lobster",
  ],
  tree_nuts: [
    "tree nut",
    "almond",
    "cashew",
    "walnut",
    "pecan",
    "pistachio",
    "hazelnut",
    "macadamia",
    "brazil nut",
  ],
  peanuts: ["peanut", "groundnut"],
  wheat: ["wheat", "gluten"],
  soy: ["soy", "soya", "soybean"],
  sesame: ["sesame", "tahini"],
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/^[a-z]{2}:/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchSavedAllergens(
  reported: string[],
  saved: MajorAllergen[]
): MajorAllergen[] {
  const reportedText = reported.map(normalize).join(" | ");
  return MAJOR_ALLERGENS.map((entry) => entry.id)
    .filter((allergen) =>
      MATCH_TERMS[allergen].some((term) => reportedText.includes(term))
    )
    .filter((allergen) => saved.includes(allergen));
}
