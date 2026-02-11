#!/usr/bin/env node
import { readFileSync } from "node:fs";

function readEnv(key, fallback = "") {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function deriveProjectId() {
  const explicit = readEnv("VITE_FIREBASE_PROJECT_ID") || readEnv("FIREBASE_PROJECT_ID");
  if (explicit) return explicit;
  try {
    const appConfigTs = readFileSync(new URL("../src/generated/appConfig.ts", import.meta.url), "utf8");
    const match = appConfigTs.match(/"projectId"\s*:\s*"([^"]+)"/);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function normalizeOrigin(input) {
  const trimmed = String(input || "").trim();
  if (!trimmed) return "";
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return withProtocol.replace(/\/+$/, "");
  }
}

function resolveFunctionsOrigin() {
  const region = readEnv("VITE_FUNCTIONS_REGION", "us-central1");
  const projectId = deriveProjectId();
  const functionsUrl = readEnv("VITE_FUNCTIONS_URL");
  if (functionsUrl) return { origin: normalizeOrigin(functionsUrl), region, projectId };
  const functionsOrigin = readEnv("VITE_FUNCTIONS_ORIGIN") || readEnv("VITE_FUNCTIONS_BASE_URL");
  if (functionsOrigin) return { origin: normalizeOrigin(functionsOrigin), region, projectId };
  return {
    origin: projectId ? `https://${region}-${projectId}.cloudfunctions.net` : "",
    region,
    projectId,
  };
}

async function fetchJson(url, init = {}, timeoutMs = 5000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch {}
    return { ok: res.ok, status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const { origin, region, projectId } = resolveFunctionsOrigin();
  console.log("[ios-smoke] Functions target", { origin, region, projectId });
  if (!origin) {
    console.error("[ios-smoke] Unable to derive Cloud Functions origin (missing Firebase projectId).");
    process.exit(1);
  }

  const health = await fetchJson(`${origin}/health`, { method: "GET" }, 2500);
  if (!health.ok || !health.json?.ok) {
    console.error("[ios-smoke] /health failed", health.status, health.text || health.json);
    process.exit(1);
  }
  console.log("[ios-smoke] health ok");

  const nutrition = await fetchJson(`${origin}/nutrition/search?q=banana&page=1`, { method: "GET" }, 5000);
  const nutritionCount = Array.isArray(nutrition.json?.results) ? nutrition.json.results.length : 0;
  if (!nutrition.ok) {
    console.error("[ios-smoke] nutrition search failed", nutrition.status, nutrition.text || nutrition.json);
    process.exit(1);
  }
  console.log("[ios-smoke] nutrition search ok", { results: nutritionCount });

  const authToken = readEnv("IOS_SMOKE_ID_TOKEN");
  if (!authToken) {
    console.warn("[ios-smoke] IOS_SMOKE_ID_TOKEN missing; skipping authenticated workouts/scan checks.");
    return;
  }
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${authToken}`,
  };

  const workout = await fetchJson(
    `${origin}/generateWorkoutPlan`,
    { method: "POST", headers, body: JSON.stringify({ prefs: { goal: "maintain", daysPerWeek: 3 } }) },
    15000
  );
  if (!workout.ok || !Array.isArray(workout.json?.days) || workout.json.days.length === 0) {
    console.error("[ios-smoke] workout generation failed", workout.status, workout.text || workout.json);
    process.exit(1);
  }
  console.log("[ios-smoke] workouts generate ok", { source: workout.json?.source || "unknown" });

  const scanProbe = await fetchJson(
    `${origin}/submitScan`,
    { method: "POST", headers, body: JSON.stringify({}) },
    10000
  );
  const reason = scanProbe.json?.reason || scanProbe.json?.errorReason || scanProbe.json?.code;
  const accepted = scanProbe.ok || reason === "provider_not_configured" || reason === "scan_engine_not_configured";
  if (!accepted) {
    console.error("[ios-smoke] scan submit probe failed", scanProbe.status, scanProbe.text || scanProbe.json);
    process.exit(1);
  }
  console.log("[ios-smoke] scan probe ok", { status: scanProbe.status, reason: reason || "none" });
})();
