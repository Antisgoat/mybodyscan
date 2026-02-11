import {
  getFunctionsBaseUrl,
  getFunctionsProjectId,
  getFunctionsRegion,
  urlJoin,
} from "@/lib/config/functionsOrigin";

const PROJECT_ID = getFunctionsProjectId() || "mybodyscan-f3daf";
const REGION = getFunctionsRegion();
const DEFAULT_FN_BASE = getFunctionsBaseUrl() || `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

export function resolveFunctionUrl(envKey: string, fnName: string): string {
  const env = (import.meta as any).env || {};
  const override = env[envKey];
  if (override && typeof override === "string" && override.trim()) {
    return override.trim();
  }
  return urlJoin(DEFAULT_FN_BASE, fnName);
}

export { PROJECT_ID, REGION, DEFAULT_FN_BASE };
