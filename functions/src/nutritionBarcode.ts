import { randomUUID } from "node:crypto";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import type { Request, Response } from "express";

import { getAuth } from "./firebase.js";
import { ensureRateLimit, identifierFromRequest } from "./http/_middleware.js";
import { fromOpenFoodFacts, fromUsdaFood, type FoodItem } from "./nutritionSearch.js";
import { HttpError, send } from "./util/http.js";
import { withCors } from "./middleware/cors.js";
import { appCheckSoft } from "./middleware/appCheckSoft.js";
import { chain } from "./middleware/chain.js";

const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const FETCH_TIMEOUT_MS = 8000;
const usdaApiKeyParam = defineSecret("USDA_FDC_API_KEY");

function getUsdaApiKey(): string | undefined {
  const envValue = (process.env.USDA_FDC_API_KEY || "").trim();
  if (envValue) {
    return envValue;
  }
  try {
    const secretValue = usdaApiKeyParam.value();
    if (typeof secretValue === "string") {
      const trimmed = secretValue.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  } catch {
    // secret not bound
  }
  return undefined;
}

interface CacheEntry {
  expires: number;
  value: { item: FoodItem; source: "Open Food Facts" | "USDA" } | null;
  source: "Open Food Facts" | "USDA";
}

const cache = new Map<string, CacheEntry>();

function extractBearerToken(req: Request): string {
  const header = req.get("authorization") || req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpError(401, "unauthorized", "missing_bearer");
  }
  const token = match[1]?.trim();
  if (!token) {
    throw new HttpError(401, "unauthorized", "missing_bearer");
  }
  return token;
}

async function verifyAuthorization(req: Request): Promise<{ uid: string | null }> {
  const token = extractBearerToken(req);
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid ?? null };
  } catch (error) {
    const message = (error as { message?: string })?.message ?? String(error);
    const code = (error as { code?: string })?.code ?? "";
    if (
      code === "app/no-app" ||
      code === "app/invalid-credential" ||
      message.includes("credential") ||
      message.includes("initializeApp")
    ) {
      console.warn("no_admin_verify", { reason: message || code || "unknown" });
      return { uid: null };
    }

    console.warn("nutrition_barcode.auth_failed", { message });
    throw new HttpError(401, "unauthorized", "invalid_token");
  }
}

async function requestJson(url: URL | string, init: RequestInit, label: string): Promise<any> {
  let lastError: HttpError | null = null;
  const target = typeof url === "string" ? url : url.toString();

  for (let attempt = 0; attempt <= 1; attempt++) {
    try {
      const response = await fetch(target, {
        ...init,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          throw new HttpError(502, "upstream_4xx", `${label}_${response.status}`);
        }
        lastError = new HttpError(502, "upstream_timeout", `${label}_${response.status}`);
        if (attempt === 1) {
          throw lastError;
        }
        continue;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof HttpError) {
        if (error.code === "upstream_4xx" || attempt === 1) {
          throw error;
        }
        lastError = error;
        continue;
      }

      const message = error instanceof Error ? error.message : String(error);
      lastError = new HttpError(502, "upstream_timeout", `${label}_${message}`);
      if (error instanceof Error && error.name === "AbortError" && attempt < 1) {
        continue;
      }
      if (attempt === 1) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new HttpError(502, "upstream_timeout", `${label}_unknown`);
}

async function fetchOff(code: string) {
  const url = `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(code)}.json`;
  const data = (await requestJson(
    url,
    {
      headers: { "User-Agent": "mybodyscan-nutrition-barcode/1.0" },
    },
    "off_product",
  )) as any;
  if (!data?.product) return null;
  const normalized = fromOpenFoodFacts(data.product);
  return normalized ? { item: normalized, source: "Open Food Facts" as const } : null;
}

async function fetchUsdaByBarcode(apiKey: string, code: string) {
  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", code);
  url.searchParams.set("pageSize", "5");
  url.searchParams.set("dataType", "Branded");
  const data = (await requestJson(
    url,
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
    "usda_barcode",
  )) as any;
  if (!Array.isArray(data?.foods) || !data.foods.length) return null;
  const normalized = data.foods
    .map((food: any) => fromUsdaFood(food))
    .filter(Boolean)
    .find((item: any) => item?.gtin === code) as FoodItem | undefined;
  const fallback = data.foods.map((food: any) => fromUsdaFood(food)).find(Boolean) as FoodItem | undefined;
  const item = normalized || fallback || null;
  return item ? { item, source: "USDA" as const } : null;
}

type ProviderResult = { item: FoodItem; source: "Open Food Facts" | "USDA" };
type ProviderOutcome = { result: ProviderResult | null; error?: HttpError | null };

async function runSafe(
  label: string,
  fn: () => Promise<ProviderResult | null>,
  context: { requestId: string; uid: string | null },
): Promise<ProviderOutcome> {
  try {
    const result = await fn();
    return { result };
  } catch (error) {
    if (error instanceof HttpError) {
      console.warn(`${label}_error`, {
        code: error.code,
        message: error.message,
        requestId: context.requestId,
        uid: context.uid ?? "anonymous",
      });
      return { result: null, error };
    }
    console.warn(`${label}_error`, {
      code: "upstream_timeout",
      message: (error as Error)?.message,
      requestId: context.requestId,
      uid: context.uid ?? "anonymous",
    });
    return { result: null, error: new HttpError(502, "upstream_timeout") };
  }
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof HttpError) {
    const payload: Record<string, unknown> = { error: error.code };
    if (error.code === "upstream_timeout") {
      payload.error = "upstream_unavailable";
    }
    if (error.message && error.message !== error.code) {
      payload.reason = error.message;
    }
    const status = error.code === "upstream_timeout" ? 502 : error.status;
    send(res, status, payload);
    return;
  }

  console.error("nutrition_barcode_unhandled", { message: (error as Error)?.message || String(error) });
  send(res, 502, { error: "upstream_unavailable" });
}

async function handleNutritionBarcode(req: Request, res: Response): Promise<void> {
  if (req.method === "OPTIONS") {
    send(res, 204, null);
    return;
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      res.setHeader("Allow", "GET,POST,OPTIONS");
      throw new HttpError(405, "method_not_allowed");
    }

    const auth = await verifyAuthorization(req);
    const uid = auth.uid;
    if (!uid) {
      throw new HttpError(401, "unauthorized");
    }

    const rateLimit = await ensureRateLimit({
      key: "nutrition_barcode",
      identifier: uid ?? identifierFromRequest(req as any),
      limit: 30,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      send(res, 429, {
        error: "rate_limited",
        retryAfter: rateLimit.retryAfterSeconds ?? null,
      });
      return;
    }

    const code = String(req.query?.code || req.body?.code || "").trim();
    if (!code) {
      throw new HttpError(400, "invalid_request", "code_required");
    }

    const apiKey = getUsdaApiKey();
    if (!apiKey) {
      throw new HttpError(501, "nutrition_not_configured", "USDA_FDC_API_KEY missing");
    }

    const now = Date.now();
    const cached = cache.get(code);
    if (cached && cached.expires > now) {
      if (!cached.value) {
        const cachedSource = cached.source === "USDA" ? "USDA" : "OFF";
        send(res, 200, { results: [], source: cachedSource, message: "no_results", cached: true });
        return;
      }
      const cachedSource = cached.value.source === "USDA" ? "USDA" : "OFF";
      send(res, 200, { results: [cached.value.item], source: cachedSource, cached: true });
      return;
    }

    const requestId = (req.get("x-request-id") || req.get("X-Request-Id") || "").trim() || randomUUID();
    const offOutcome = await runSafe(
      "nutrition_barcode_off",
      () => fetchOff(code),
      { requestId, uid },
    );

    let result = offOutcome.result;
    let usdaOutcome: ProviderOutcome | null = null;

    usdaOutcome = await runSafe(
      "nutrition_barcode_usda",
      () => fetchUsdaByBarcode(apiKey, code),
      { requestId, uid },
    );
    result = result || usdaOutcome.result;

    if (result) {
      cache.set(code, { value: result, source: result.source, expires: now + CACHE_TTL });
      const normalizedSource = result.source === "USDA" ? "USDA" : "OFF";
      send(res, 200, { results: [result.item], source: normalizedSource, cached: false });
      return;
    }

    const errors = [offOutcome.error, usdaOutcome?.error].filter(Boolean) as HttpError[];
    if (errors.length > 0) {
      throw errors.find((error) => error.code === "upstream_4xx") ?? errors[0]!;
    }

    const fallbackSource: "Open Food Facts" | "USDA" = "USDA";
    cache.set(code, { value: null, source: fallbackSource, expires: now + CACHE_TTL });
    send(res, 200, {
      results: [],
      source: fallbackSource === "USDA" ? "USDA" : "OFF",
      message: "no_results",
      cached: false,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function nutritionBarcodeHandler(req: Request, res: Response): Promise<void> {
  await handleNutritionBarcode(req, res);
}

export const nutritionBarcode = onRequest(
  { region: "us-central1", secrets: [usdaApiKeyParam], invoker: "public", concurrency: 20 },
  (req: Request, res: Response) =>
    chain(withCors, appCheckSoft)(req, res, () => void handleNutritionBarcode(req, res)),
);
