import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";

const fdcKey = defineSecret("USDA_FDC_API_KEY");

type Req = any;

function normalizeText(s?: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a: string, b: string): number {
  const as = new Set(a.split(" ").filter(Boolean));
  const bs = new Set(b.split(" ").filter(Boolean));
  if (as.size === 0 || bs.size === 0) return 0;
  let overlap = 0;
  as.forEach((t) => {
    if (bs.has(t)) overlap += 1;
  });
  return overlap / Math.max(as.size, bs.size);
}

function chooseUsdaBestMatch(query: string, brandHint: string | undefined, foods: any[]): any {
  let best: any = null;
  let bestScore = -1;
  for (const f of foods) {
    const nameScore = similarity(normalizeText(f.description || ""), normalizeText(query));
    const brandScore = brandHint
      ? similarity(normalizeText(f.brandOwner || ""), normalizeText(brandHint))
      : 0;
    const ln = f.labelNutrients || {};
    const hasNutri = (ln.energy || ln.calories) && ln.protein && ln.carbohydrates && ln.fat;
    const nutriScore = hasNutri ? 1 : 0;
    const total = nameScore * 0.6 + brandScore * 0.3 + nutriScore * 0.1;
    if (total > bestScore) {
      bestScore = total;
      best = f;
    }
  }
  return best;
}

export interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  serving?: { amount: number; unit: string };
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  alcohol?: number;
  source: "USDA" | "OFF";
}

function mapFdcFood(src: any): FoodItem {
  const label = src.brandName ? `${src.brandName} ${src.description}`.trim() : src.description;

  let calories: number | undefined;
  let protein: number | undefined;
  let carbs: number | undefined;
  let fat: number | undefined;
  let alcohol: number | undefined;

  if (src.labelNutrients) {
    calories = src.labelNutrients.calories?.value;
    protein = src.labelNutrients.protein?.value;
    carbs = src.labelNutrients.carbohydrates?.value;
    fat = src.labelNutrients.fat?.value;
    alcohol = src.labelNutrients.alcohol?.value;
  }

  if ((!calories || !protein || !carbs || !fat) && Array.isArray(src.foodNutrients)) {
    for (const n of src.foodNutrients) {
      const name = (n.nutrientName || "").toLowerCase();
      const val = typeof n.value === "number" ? n.value : undefined;
      if (val === undefined) continue;
      if (!calories && name.includes("energy") && name.includes("kcal")) calories = val;
      else if (!protein && name === "protein") protein = val;
      else if (!carbs && name.includes("carbohydrate")) carbs = val;
      else if (!fat && name.includes("fat")) fat = val;
      else if (!alcohol && name.includes("alcohol")) alcohol = val;
    }
  }

  let serving: { amount: number; unit: string } | undefined;
  if (typeof src.servingSize === "number" && src.servingSizeUnit) {
    serving = { amount: src.servingSize, unit: src.servingSizeUnit };
  } else if (src.householdServingFullText) {
    const match = String(src.householdServingFullText).match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
    if (match) serving = { amount: parseFloat(match[1]), unit: match[2] };
  }

  return {
    id: `fdc_${src.fdcId}`,
    name: label,
    brand: src.brandName || undefined,
    serving,
    calories,
    protein,
    carbs,
    fat,
    alcohol,
    source: "USDA",
  };
}

function mapOffProduct(p: any, barcode: string): FoodItem {
  const n = p.nutriments || {};
  const get = (k: string): number | undefined => {
    const v = n[k];
    if (typeof v === "number") return v;
    const num = parseFloat(v);
    return isNaN(num) ? undefined : num;
  };
  const energy = (suf: string) => {
    const kcal = get(`energy-kcal_${suf}`);
    if (kcal !== undefined) return kcal;
    const kj = get(`energy_${suf}`);
    return kj !== undefined ? kj * 0.239006 : undefined;
  };

  let calories = energy("serving");
  let protein = get("proteins_serving");
  let carbs = get("carbohydrates_serving");
  let fat = get("fat_serving");
  let serving: { amount: number; unit: string } | undefined;
  if (calories && protein && carbs && fat) {
    if (p.serving_size) {
      const m = String(p.serving_size).match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
      if (m) serving = { amount: parseFloat(m[1]), unit: m[2] };
    }
  } else {
    calories = energy("100g");
    protein = get("proteins_100g");
    carbs = get("carbohydrates_100g");
    fat = get("fat_100g");
    serving = { amount: 100, unit: "g" };
  }

  return {
    id: `off_${barcode}`,
    name: p.product_name || p.generic_name || "Unknown",
    brand: p.brands || undefined,
    serving,
    calories,
    protein,
    carbs,
    fat,
    source: "OFF",
  };
}

async function requireUser(req: Req): Promise<void> {
  const authHeader = req.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (match) {
    await getAuth().verifyIdToken(match[1]);
    return;
  }
  if (process.env.VITE_PREVIEW === "true" || req.get("x-demo")) return;
  throw new Error("Unauthorized");
}

const buckets = new Map<string, { tokens: number; ts: number }>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ip) || { tokens: 10, ts: now };
  const elapsed = now - bucket.ts;
  if (elapsed > 60000) {
    bucket.tokens = 10;
    bucket.ts = now;
  }
  if (bucket.tokens <= 0) {
    buckets.set(ip, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(ip, bucket);
  return true;
}

function cors(req: Req, res: any): boolean {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Demo");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}

export const foodSearch = onRequest({ secrets: [fdcKey] }, async (req, res) => {
  if (cors(req, res)) return;
  try {
    if (req.method !== "POST") {
      res.status(405).end();
      return;
    }
    await requireUser(req);
    const ip = (req.get("x-forwarded-for") || req.ip || "").split(",")[0];
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: "rate_limit" });
      return;
    }
    const { query, page, size } = req.body as { query?: string; page?: number; size?: number; locale?: string };
    if (!query) {
      res.status(400).json({ error: "query" });
      return;
    }
    const key = fdcKey.value();
    if (!key) {
      res.status(503).json({ error: "missing_key" });
      return;
    }
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&query=${encodeURIComponent(
      query
    )}&pageSize=${size || 10}&pageNumber=${page || 1}&dataType=Branded,Survey%20(FNDDS),SR%20Legacy`;
    const r = await fetch(url);
    if (!r.ok) {
      res.status(502).json({ error: "provider" });
      return;
    }
    const data = await r.json();
    const foods = Array.isArray(data.foods) ? data.foods.slice(0, 10) : [];
    const items = foods.map(mapFdcFood);
    res.json({ items });
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: "error" });
  }
});

export const foodLookupUPC = onRequest({ secrets: [fdcKey] }, async (req, res) => {
  if (cors(req, res)) return;
  try {
    if (req.method !== "POST") {
      res.status(405).end();
      return;
    }
    await requireUser(req);
    const ip = (req.get("x-forwarded-for") || req.ip || "").split(",")[0];
    if (!checkRateLimit(ip)) {
      res.status(429).json({ error: "rate_limit" });
      return;
    }
    const { upc } = req.body as { upc?: string };
    if (!upc || !/^\d{8,14}$/.test(upc)) {
      res.status(400).json({ error: "upc" });
      return;
    }
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(upc)}.json`);
    if (!r.ok) {
      res.status(502).json({ error: "provider" });
      return;
    }
    const data = await r.json();
    const offItem = data.status === 1 && data.product ? mapOffProduct(data.product, upc) : null;
    if (
      offItem &&
      offItem.calories !== undefined &&
      offItem.protein !== undefined &&
      offItem.carbs !== undefined &&
      offItem.fat !== undefined
    ) {
      res.json({ items: [offItem] });
      return;
    }

    const prod = data.product || {};
    const candidates = [
      prod.product_name,
      prod.generic_name,
      prod.brands && prod.product_name ? `${prod.brands} ${prod.product_name}` : undefined,
      upc,
    ];
    const query = candidates.map(normalizeText).find((s) => s) || "";
    const brandHint = prod.brands;
    const key = fdcKey.value();
    if (!key) {
      res.status(503).json({ error: "missing_key" });
      return;
    }
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&query=${encodeURIComponent(
      query
    )}&pageSize=10&dataType=Branded,Survey%20(FNDDS),SR%20Legacy`;
    const u = await fetch(url);
    if (!u.ok) {
      res.status(502).json({ error: "provider" });
      return;
    }
    const udata = await u.json();
    const foods = Array.isArray(udata.foods) ? udata.foods : [];
    const best = chooseUsdaBestMatch(query, brandHint, foods);
    const items = best ? [mapFdcFood(best)] : [];
    res.json({ items });
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: "error" });
  }
});

