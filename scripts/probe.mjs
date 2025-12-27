#!/usr/bin/env node
import { mintIdToken } from "./idtoken.mjs";

const DEFAULT_REGION = "us-central1";
const DEFAULT_TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 15000);

function isObject(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isCanonicalScanPath(pathValue, uid, scanId, pose) {
  if (!isNonEmptyString(pathValue)) return false;
  const expected = `scans/${uid}/${scanId}/${pose}.jpg`;
  return String(pathValue) === expected;
}

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
  // Scan flow probes (routing + JSON + canonical paths):
  {
    name: "scanStart",
    functionName: "startScanSession",
    path: "/",
    method: "POST",
    body: { currentWeightKg: 80, goalWeightKg: 75, correlationId: `probe-${Date.now()}` },
    expect: ({ status, parsed }) => {
      if (status !== 200) return { ok: false, message: `expected 200, got ${status}` };
      if (!isObject(parsed)) return { ok: false, message: "expected JSON object" };
      const scanId = isNonEmptyString(parsed.scanId) ? parsed.scanId : null;
      if (!scanId) return { ok: false, message: "missing scanId" };
      const storagePaths = isObject(parsed.storagePaths) ? parsed.storagePaths : null;
      if (!storagePaths) return { ok: false, message: "missing storagePaths" };
      const uid = storagePaths.front?.split("/")[1];
      if (!isNonEmptyString(uid)) return { ok: false, message: "unable to infer uid from storagePaths" };
      for (const pose of ["front", "back", "left", "right"]) {
        if (!hasOwn(storagePaths, pose)) return { ok: false, message: `missing storagePaths.${pose}` };
        if (!isCanonicalScanPath(storagePaths[pose], uid, scanId, pose)) {
          return { ok: false, message: `non-canonical path for ${pose}: ${String(storagePaths[pose])}` };
        }
      }
      return { ok: true };
    },
  },
  {
    name: "scanSubmit",
    functionName: "submitScan",
    path: "/",
    method: "POST",
    // Body is filled dynamically from scanStart response.
    body: null,
    // We don't upload photos in the probe; submit should fail *cleanly* and as JSON.
    expect: ({ parsed }) => {
      if (!isObject(parsed)) return { ok: false, message: "expected JSON object" };
      // Any structured error is acceptable, but we strongly prefer missing_photos.
      if (isNonEmptyString(parsed.reason) && parsed.reason === "missing_photos") return { ok: true };
      if (isNonEmptyString(parsed.code) && isNonEmptyString(parsed.message)) return { ok: true };
      return { ok: false, message: "unexpected submit response shape" };
    },
  },
  {
    name: "scanDelete",
    functionName: "deleteScan",
    path: "/",
    method: "POST",
    // Body is filled dynamically from scanStart response.
    body: null,
    expect: ({ parsed }) => {
      if (!isObject(parsed)) return { ok: false, message: "expected JSON object" };
      if (parsed.ok === true) return { ok: true };
      return { ok: false, message: "deleteScan did not return ok:true" };
    },
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
  // Default behavior: connectivity/CORS/route check. Treat any JSON response as "ok"
  // unless a stricter `expect()` is provided for this endpoint.
  let ok = parsedOk;
  let expectMessage;
  if (typeof endpoint.expect === "function") {
    const verdict = endpoint.expect({
      status,
      parsed: parsedOk ? parsed : null,
      url: url.href,
    });
    ok = Boolean(verdict?.ok);
    expectMessage = verdict?.message;
  }

  const prefix = ok ? "[ok]" : "[fail]";
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  const extra = expectMessage ? ` (${expectMessage})` : "";
  const logLine = `${prefix} ${endpoint.method} ${url.href} -> ${status}${statusText}${extra} :: ${snippet}`;

  if (ok) {
    console.log(logLine);
  } else {
    if (!parsedOk && text) {
      console.error(`${logLine} (non-JSON response)`);
    } else {
      console.error(logLine);
    }
  }

  return { ok, parsed: parsedOk ? parsed : null, status };
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
    /** @type {{ scanId?: string, storagePaths?: any, weights?: { currentWeightKg: number, goalWeightKg: number }, correlationId?: string }} */
    const ctx = {};
    for (const endpoint of ENDPOINTS) {
      // Inject scan payloads once we have a scanId.
      if (endpoint.name === "scanSubmit") {
        if (ctx.scanId && ctx.storagePaths && ctx.weights) {
          endpoint.body = {
            scanId: ctx.scanId,
            photoPaths: ctx.storagePaths,
            currentWeightKg: ctx.weights.currentWeightKg,
            goalWeightKg: ctx.weights.goalWeightKg,
            correlationId: ctx.correlationId,
          };
        } else {
          endpoint.body = { scanId: "missing", photoPaths: {}, currentWeightKg: 0, goalWeightKg: 0 };
        }
      }
      if (endpoint.name === "scanDelete") {
        endpoint.body = ctx.scanId ? { scanId: ctx.scanId } : { scanId: "missing" };
      }

      const result = await probeEndpoint(base, endpoint, token);
      allOk = allOk && result.ok;

      if (endpoint.name === "scanStart" && result.parsed && typeof result.parsed === "object") {
        const scanId = typeof result.parsed.scanId === "string" ? result.parsed.scanId : null;
        const storagePaths =
          result.parsed.storagePaths && typeof result.parsed.storagePaths === "object"
            ? result.parsed.storagePaths
            : null;
        if (scanId && storagePaths) {
          ctx.scanId = scanId;
          ctx.storagePaths = storagePaths;
          ctx.weights = {
            currentWeightKg: Number(endpoint.body?.currentWeightKg ?? 0),
            goalWeightKg: Number(endpoint.body?.goalWeightKg ?? 0),
          };
          ctx.correlationId =
            typeof endpoint.body?.correlationId === "string" ? endpoint.body.correlationId : undefined;
        }
      }
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
