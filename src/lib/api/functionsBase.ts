const PROJECT_ID =
  (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID || "mybodyscan-f3daf";
const REGION = (import.meta as any).env?.VITE_FUNCTIONS_REGION || "us-central1";
const DEFAULT_FN_BASE = `https://${REGION}-${PROJECT_ID}.cloudfunctions.net`;

export function resolveFunctionUrl(envKey: string, fnName: string): string {
  const env = (import.meta as any).env || {};
  const override = env[envKey];
  if (override && typeof override === "string" && override.trim())
    return override.trim();
  return `${DEFAULT_FN_BASE}/${fnName}`;
}

export { PROJECT_ID, REGION, DEFAULT_FN_BASE };
