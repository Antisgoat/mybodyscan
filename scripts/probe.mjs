#!/usr/bin/env node
import { mintIdToken } from "./idtoken.mjs";

const DEFAULT_REGION = "us-central1";
const DEFAULT_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 15000);

const ENDPOINTS = [
  {
    name: "systemHealth",
    functionName: "systemHealth",
    path: "/",
    method: "GET",
  },
  {
    name: "coachChat",
    functionName: "api",
    path: "/api/coach/chat",
    method: "POST",
    // Match the deployed API contract (expects `message`).
    body: { message: "probe" },
  },
  {
    name: "nutritionSearch",
    functionName: "api",
    path: "/api/nutrition/search?q=chicken breast",
    method: "GET",
  },
  {
    name: "createCheckout",
    // Callable function exposed as an HTTP endpoint at /createCheckout
    functionName: "createCheckout",
    path: "/",
    method: "POST",
    body: { priceId: process.env.TEST_PRICE_ID || "price_xxx" },
  },
];

function ensureTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

function expandBaseTemplates(tokens, { projectId, region }) {
  const replacements = {
    "{{projectId}}": projectId,
    "{projectId}": projectId,
    "{{region}}": region,
    "{region}": region,
  };

  return tokens
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((token) => {
      let base = token;

      for (const [needle, replacement] of Object.entries(replacements)) {
        base = base.split(needle).join(replacement);
      }

      if (base === "cloudfunctions.net") {
        base = `${region}-${projectId}.cloudfunctions.net`;
      } else if (base === "a.run.app") {
        base = `${projectId}-${region}.a.run.app`;
      }

      if (!/^https?:\/\//i.test(base)) {
        base = `https://${base}`;
      }

      return base.replace(/\/+$/, "");
    });
}

function buildBases({ projectId, region, basesEnv }) {
  // Prefer Cloud Functions hostname. Cloud Run base URLs vary by deployment and
  // often aren't stable/public across environments.
  const defaultBases = [`https://${region}-${projectId}.cloudfunctions.net`];

  if (!basesEnv) {
    return defaultBases;
  }

  const tokens = basesEnv.split(/[,\s]+/);
  const expanded = expandBaseTemplates(tokens, { projectId, region });

  return expanded.length ? expanded : defaultBases;
}

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function probeEndpoint(base, endpoint, token) {
  const fn = String(endpoint.functionName || "").trim();
  if (!fn) {
    throw new Error(`Missing functionName for probe endpoint "${endpoint.name}".`);
  }
  const url = new URL(`${fn}${endpoint.path || "/"}`.replace(/^\//, ""), ensureTrailingSlash(base));

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };

  let body;
  if (endpoint.method === "POST") {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(endpoint.body ?? {});
  }

  let response;
  try {
    response = await fetchWithTimeout(url, {
      method: endpoint.method,
      headers,
      body,
    });
  } catch (error) {
    console.error(
      `[probe] ${endpoint.method} ${url.href} failed: ${error.message}`
    );
    return { ok: false };
  }

  const text = await response.text();
  const snippet = text.slice(0, 200) || "<empty>";

  let parsed;
  let parsedOk = false;
  if (text) {
    try {
      parsed = JSON.parse(text);
      parsedOk = true;
    } catch (error) {
      parsedOk = false;
    }
  }

  const status = response.status;
  // This probe is primarily a connectivity/CORS/route check:
  // treat any JSON response as "ok" (even if it's an error payload).
  const ok = parsedOk;

  const prefix = ok ? "[ok]" : "[fail]";
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  const logLine = `${prefix} ${endpoint.method} ${url.href} -> ${status}${statusText} :: ${snippet}`;

  if (ok) {
    console.log(logLine);
  } else {
    if (!parsedOk && text) {
      console.error(`${logLine} (non-JSON response)`);
    } else {
      console.error(logLine);
    }
  }

  return { ok };
}

async function main() {
  const projectId = process.env.PROJECT_ID;
  if (!projectId) {
    throw new Error("PROJECT_ID is required.");
  }

  const region = process.env.REGION || DEFAULT_REGION;
  const bases = buildBases({ projectId, region, basesEnv: process.env.BASES });

  console.log(
    `[probe] Target project ${projectId} (${region}). Using bases: ${bases.join(", ")}`
  );

  const { token } = await mintIdToken();

  let allOk = true;

  for (const base of bases) {
    console.log(`[probe] Base ${base}`);
    for (const endpoint of ENDPOINTS) {
      const result = await probeEndpoint(base, endpoint, token);
      allOk = allOk && result.ok;
    }
  }

  if (!allOk) {
    throw new Error("One or more probes failed.");
  }
}

main().catch((error) => {
  console.error(`[probe] ${error.message}`);
  process.exitCode = 1;
});
