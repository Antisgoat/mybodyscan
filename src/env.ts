export const env = {
  VITE_FIREBASE_API_KEY: (import.meta.env.VITE_FIREBASE_API_KEY ??
    "") as string,
  VITE_FIREBASE_AUTH_DOMAIN: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ??
    "") as string,
  VITE_FIREBASE_PROJECT_ID: (import.meta.env.VITE_FIREBASE_PROJECT_ID ??
    "") as string,
  VITE_FIREBASE_STORAGE_BUCKET: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ??
    "") as string,
  VITE_FIREBASE_MESSAGING_SENDER_ID: (import.meta.env
    .VITE_FIREBASE_MESSAGING_SENDER_ID ?? "") as string,
  VITE_FIREBASE_APP_ID: (import.meta.env.VITE_FIREBASE_APP_ID ?? "") as string,
  VITE_FIREBASE_MEASUREMENT_ID:
    (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string) || "",
  VITE_ENABLE_GOOGLE: (import.meta.env.VITE_ENABLE_GOOGLE ?? "true") as string,
  VITE_ENABLE_APPLE: (import.meta.env.VITE_ENABLE_APPLE ?? "true") as string,
  VITE_ENABLE_EMAIL: (import.meta.env.VITE_ENABLE_EMAIL ?? "true") as string,
  VITE_ENABLE_DEMO: (import.meta.env.VITE_ENABLE_DEMO ?? "true") as string,
};

const normalizeBoolean = (value: unknown, fallback = false): boolean => {
  if (value == null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return (
    normalized === "true" ||
    normalized === "1" ||
    normalized === "yes" ||
    normalized === "on"
  );
};

export const DEMO_MODE: boolean = normalizeBoolean(
  import.meta.env.VITE_DEMO_MODE,
  false
);
