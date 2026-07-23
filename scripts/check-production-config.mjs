import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function parseEnvFile(file) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return {};
  const values = {};
  for (const line of fs.readFileSync(fullPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const fileValues = {
  ...parseEnvFile(".env.production"),
  ...parseEnvFile(".env.production.local"),
};
const functionValues = parseEnvFile("functions/.env.mybodyscan-f3daf");
const firebaseJson = JSON.parse(
  fs.readFileSync(path.join(root, "firebase.json"), "utf8")
);

const read = (key) => String(process.env[key] || fileValues[key] || "").trim();
const missing = [];

for (const key of [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_VAPID_KEY",
  "VITE_FIREBASE_APP_ID",
  "VITE_STRIPE_PUBLISHABLE_KEY",
  "VITE_APPCHECK_SITE_KEY",
]) {
  if (!read(key)) missing.push(key);
}

const stripeKey = read("VITE_STRIPE_PUBLISHABLE_KEY");
if (stripeKey && !stripeKey.startsWith("pk_live_")) {
  console.error("Production Stripe publishable key is not a live-mode key.");
  process.exit(1);
}

if (missing.length) {
  console.error(`Missing production configuration: ${missing.join(", ")}`);
  console.error(
    "Provide public web values through .env.production.local or the deployment environment. Values were not printed."
  );
  process.exit(1);
}

const expectedFunctionValues = {
  APP_CHECK_MODE: "soft",
  AUTH_APPLE_ENABLED: "true",
  AUTH_DEMO_ENABLED: "true",
  AUTH_EMAIL_ENABLED: "true",
  AUTH_GOOGLE_ENABLED: "true",
  COACH_RPM: "12",
  CREDIT_EXP_MONTHS: "12",
  HOST_BASE_URL: "https://mybodyscanapp.com",
  NUTRITION_RPM: "20",
  OPENAI_BASE_URL: "https://api.openai.com/v1",
  OPENAI_MODEL: "gpt-4o-mini",
  OPENAI_PROVIDER: "openai",
  REVENUECAT_ENTITLEMENT_ID: "pro",
  REVENUECAT_MONTHLY_PRODUCT_ID: "com.mybodyscan.pro.monthly",
  REVENUECAT_ONE_SCAN_PRODUCT_ID: "com.mybodyscan.scan.single",
  REVENUECAT_YEARLY_PRODUCT_ID: "com.mybodyscan.pro.yearly",
};
for (const [key, expected] of Object.entries(expectedFunctionValues)) {
  if (functionValues[key] !== expected) {
    console.error(
      `Production Functions configuration is missing or incorrect: ${key}.`
    );
    process.exit(1);
  }
}

if ("environmentVariables" in (firebaseJson.functions?.[0] ?? {})) {
  console.error(
    "Non-secret Functions values must use functions/.env.mybodyscan-f3daf, not firebase.json.environmentVariables."
  );
  process.exit(1);
}

console.log("Production public configuration is present and live-mode safe.");
console.log("Production non-secret Functions configuration is present.");
