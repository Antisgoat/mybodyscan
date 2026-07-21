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

const read = (key) => String(process.env[key] || fileValues[key] || "").trim();
const missing = [];

for (const key of [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
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

console.log("Production public configuration is present and live-mode safe.");
