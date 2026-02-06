import fs from "fs";
import path from "path";
// Minimal dotenv-compatible parser (kept local to avoid runtime dependencies).
const dotenv = {
  parse(src) {
    const out = {};
    for (const line of src.split(/\r?\n/)) {
      if (!line) continue;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
    return out;
  },
};

const ROOT_DIR = process.cwd();
const OUTPUT_PATH = path.join(ROOT_DIR, "src", "generated", "appConfig.ts");
const ENV_FILES = [".env", ".env.production", ".env.local"];

const loadedEnv = {};
const loadedFiles = [];

for (const file of ENV_FILES) {
  const fullPath = path.join(ROOT_DIR, file);
  if (!fs.existsSync(fullPath)) continue;
  const contents = fs.readFileSync(fullPath, "utf8");
  const parsed = dotenv.parse(contents);
  Object.assign(loadedEnv, parsed);
  loadedFiles.push(file);
}

const forbiddenKeys = [
  "OPENAI_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_SECRET",
  "STRIPE_API_KEY",
  "STRIPE_API_SECRET",
  "STRIPE_SK",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
  "GOOGLE_APPLICATION_CREDENTIALS",
];

const forbiddenMatches = forbiddenKeys.filter((key) => {
  const value = String(loadedEnv[key] ?? "").trim();
  return Boolean(value);
});

if (forbiddenMatches.length) {
  throw new Error(
    `Refusing to build with server secrets in env files: ${forbiddenMatches.join(", ")}. ` +
      "Move secrets to server-side config (functions/secrets) and remove them from .env files."
  );
}

const requiredFirebaseKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
];

const readEnvValue = (key) => {
  const fileValue = loadedEnv[key];
  if (typeof fileValue === "string") return fileValue;
  if (typeof process !== "undefined" && process.env) {
    const runtimeValue = process.env[key];
    if (typeof runtimeValue === "string") return runtimeValue;
  }
  return "";
};

const missingFirebaseKeys = requiredFirebaseKeys.filter((key) => {
  return !String(readEnvValue(key) ?? "").trim();
});

if (missingFirebaseKeys.length) {
  const sources = loadedFiles.length ? loadedFiles.join(", ") : "(no env files found)";
  throw new Error(
    `Missing required Firebase env values: ${missingFirebaseKeys.join(", ")}. ` +
      `Checked: ${sources}.`
  );
}

const firebaseConfig = {
  apiKey: String(readEnvValue("VITE_FIREBASE_API_KEY") ?? "").trim(),
  authDomain: String(readEnvValue("VITE_FIREBASE_AUTH_DOMAIN") ?? "").trim(),
  projectId: String(readEnvValue("VITE_FIREBASE_PROJECT_ID") ?? "").trim(),
  storageBucket: String(readEnvValue("VITE_FIREBASE_STORAGE_BUCKET") ?? "").trim(),
  messagingSenderId: String(readEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID") ?? "").trim(),
  appId: String(readEnvValue("VITE_FIREBASE_APP_ID") ?? "").trim(),
  measurementId: String(readEnvValue("VITE_FIREBASE_MEASUREMENT_ID") ?? "").trim(),
};

const mode =
  process.env.MODE ||
  process.env.VITE_MODE ||
  process.env.NODE_ENV ||
  "production";
const isNative =
  mode === "native" ||
  process.env.CAPACITOR_PLATFORM != null ||
  process.env.MBS_NATIVE_RELEASE === "1";

const buildMeta = {
  mode,
  isNative,
  timestamp: new Date().toISOString(),
};

const outputDir = path.dirname(OUTPUT_PATH);
fs.mkdirSync(outputDir, { recursive: true });

const fileContents = `// THIS FILE IS AUTO-GENERATED. DO NOT EDIT MANUALLY.\n` +
  `// Run: node scripts/generate-app-config.mjs\n` +
  `\n` +
  `export const APP_CONFIG = ${JSON.stringify({ firebase: firebaseConfig }, null, 2)} as const;\n` +
  `\n` +
  `export const BUILD_META = ${JSON.stringify(buildMeta, null, 2)} as const;\n`;

fs.writeFileSync(OUTPUT_PATH, fileContents, "utf8");

console.log(
  `[config] wrote ${path.relative(ROOT_DIR, OUTPUT_PATH)} (mode=${mode}, native=${isNative})`
);
