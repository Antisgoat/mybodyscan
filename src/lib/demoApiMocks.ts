import { demoCoach, demoLatestScan } from "./demoDataset";

type DemoNutritionItem = {
  id: string;
  name: string;
  brand?: string;
  basePer100g?: {
    kcal: number;
    protein: number;
    carbs: number;
    fat: number;
  };
  servings?: Array<{ id: string; label: string; grams: number; isDefault?: boolean }>;
  serving?: { qty?: number | null; unit?: string | null; text?: string };
};

const demoNutritionItems: DemoNutritionItem[] = [
  {
    id: "demo-food-chicken",
    name: "Chicken Breast, grilled",
    basePer100g: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
    servings: [
      { id: "100g", label: "100 g", grams: 100, isDefault: true },
      { id: "1-cup", label: "1 cup (cooked)", grams: 140 },
    ],
  },
  {
    id: "demo-food-yogurt",
    name: "Greek Yogurt, plain",
    brand: "Demo Dairy",
    basePer100g: { kcal: 59, protein: 10, carbs: 3.6, fat: 0.4 },
    servings: [
      { id: "170g", label: "170 g (single cup)", grams: 170, isDefault: true },
      { id: "1oz", label: "1 oz", grams: 28 },
    ],
  },
  {
    id: "demo-food-rice",
    name: "Brown Rice, cooked",
    basePer100g: { kcal: 112, protein: 2.6, carbs: 23, fat: 0.9 },
    servings: [
      { id: "1cup", label: "1 cup", grams: 195, isDefault: true },
      { id: "100g", label: "100 g", grams: 100 },
    ],
  },
];

export function mockNutritionSearch(q: string) {
  const term = q.trim().toLowerCase();
  const items = demoNutritionItems.filter((item) => item.name.toLowerCase().includes(term));
  return {
    results: (items.length ? items : demoNutritionItems).map((item) => ({
      id: item.id,
      name: item.name,
      brand: item.brand,
      basePer100g: item.basePer100g,
      servings: item.servings,
      serving: item.serving,
      source: "demo",
      raw: { source: "demo" },
    })),
    source: "demo",
  };
}

export function mockBarcodeLookup(code: string) {
  const normalized = code.trim() || "000000";
  return {
    results: [
      {
        id: `demo-barcode-${normalized}`,
        name: "Demo Protein Bar",
        brand: "MyBodyScan Labs",
        basePer100g: { kcal: 350, protein: 33, carbs: 32, fat: 12 },
        servings: [
          { id: "1bar", label: "1 bar", grams: 60, isDefault: true },
        ],
        serving: { text: "1 bar" },
        source: "demo",
        raw: { source: "demo", barcode: normalized },
      },
    ],
    source: "demo",
  };
}

export function mockCoachReply(message: string) {
  const trimmed = message.trim();
  const defaultReply = demoCoach.messages[0]?.reply ??
    "In demo mode, imagine I’m your coach. Tip: hit your protein target and keep daily steps high.";
  const followUp = demoCoach.messages[1]?.reply ?? defaultReply;
  return {
    reply: trimmed.length > 0 ? followUp : defaultReply,
  };
}

export function mockStartScan(payload: unknown) {
  return {
    scanId: "demo-scan-new",
    status: "completed",
    resultId: demoLatestScan.id,
    payload,
  };
}

export function mockLatestScan() {
  return demoLatestScan;
}
