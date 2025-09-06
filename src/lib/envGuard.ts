export function assertEnv() {
  if (!import.meta.env.PROD) return;
  const required = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
  ];
  const missing = required.filter(k => !import.meta.env[k as keyof ImportMetaEnv]);
  if (missing.length) {
    // Visible, actionable error instead of blank page
    throw new Error("Missing production env vars: " + missing.join(", "));
  }
}
