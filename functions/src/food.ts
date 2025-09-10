import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";

const appId = defineSecret("NUTRITIONIX_APP_ID");
const apiKey = defineSecret("NUTRITIONIX_API_KEY");

type Req = any;

interface FoodItem {
  id: string;
  name: string;
  brand?: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  alcohol?: number;
}

function mapItem(src: any): FoodItem {
  return {
    id: src.nix_item_id || src.tag_id || src.food_name,
    name: src.food_name,
    brand: src.brand_name || undefined,
    serving: [src.serving_qty, src.serving_unit].filter(Boolean).join(" ").trim(),
    calories: Number(src.nf_calories) || 0,
    protein: Number(src.nf_protein) || 0,
    carbs: Number(src.nf_total_carbohydrate) || 0,
    fat: Number(src.nf_total_fat) || 0,
    alcohol: Number(src.nf_alcohol) || 0,
  };
}

async function requireUser(req: Req): Promise<void> {
  const authHeader = req.get("authorization") || "";
  const match = authHeader.match(/^Bearer (.+)$/);
  if (match) {
    await getAuth().verifyIdToken(match[1]);
    return;
  }
  if (process.env.VITE_PREVIEW === "true" || req.get("x-demo-guard")) return;
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

export const foodSearch = onRequest({ secrets: [appId, apiKey] }, async (req, res) => {
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
    const { query } = req.body as { query?: string; locale?: string };
    if (!query) {
      res.status(400).json({ error: "query" });
      return;
    }
    const r = await fetch("https://trackapi.nutritionix.com/v2/search/instant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-id": appId.value(),
        "x-app-key": apiKey.value(),
      },
      body: JSON.stringify({ query, detailed: true }),
    });
    if (!r.ok) {
      res.status(502).json({ error: "provider" });
      return;
    }
    const data = await r.json();
    const branded = Array.isArray(data.branded) ? data.branded.slice(0, 5) : [];
    const items = branded.map(mapItem);
    res.json(items);
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: "error" });
  }
});

export const foodLookupUPC = onRequest({ secrets: [appId, apiKey] }, async (req, res) => {
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
    if (!upc) {
      res.status(400).json({ error: "upc" });
      return;
    }
    const r = await fetch(`https://trackapi.nutritionix.com/v2/search/item?upc=${encodeURIComponent(upc)}`, {
      headers: {
        "x-app-id": appId.value(),
        "x-app-key": apiKey.value(),
      },
    });
    if (!r.ok) {
      res.status(502).json({ error: "provider" });
      return;
    }
    const data = await r.json();
    const foods = Array.isArray(data.branded) ? data.branded : data.foods;
    const items = Array.isArray(foods) && foods.length > 0 ? [mapItem(foods[0])] : [];
    res.json(items);
  } catch (e: any) {
    res.status(e.message === "Unauthorized" ? 401 : 500).json({ error: "error" });
  }
});
