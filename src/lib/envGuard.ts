export function assertEnv() {
  if (import.meta.env.PROD) {
    const required = [
      "VITE_FIREBASE_API_KEY",
      "VITE_FIREBASE_AUTH_DOMAIN",
      "VITE_FIREBASE_PROJECT_ID",
      "VITE_FIREBASE_STORAGE_BUCKET",
      "VITE_FIREBASE_MESSAGING_SENDER_ID",
      "VITE_FIREBASE_APP_ID",
    ];
    for (const key of required) {
      if (!import.meta.env[key as keyof ImportMetaEnv]) {
        throw new Error(`Missing env var ${key}`);
      }
    }
  }
}
