const env = import.meta.env;

const fromEnv =
  (env.VITE_FUNCTIONS_ORIGIN || env.VITE_FUNCTIONS_URL || "").trim();

const fallbackProd =
  "https://us-central1-mybodyscan-f3daf.cloudfunctions.net";

export const FUNCTIONS_ORIGIN = fromEnv || (env.PROD ? fallbackProd : "");

export const FUNCTIONS_CONFIG = {
  origin: FUNCTIONS_ORIGIN,
  isConfigured: Boolean(FUNCTIONS_ORIGIN),
} as const;
