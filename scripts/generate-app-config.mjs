import fs from "fs";
import path from "path";
import { execSync } from "child_process";
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
const mode =
  process.env.MODE ||
  process.env.VITE_MODE ||
  process.env.NODE_ENV ||
  "production";
const isNative =
  mode === "native" ||
  process.env.MBS_NATIVE === "1" ||
  process.env.CAPACITOR_NATIVE === "1" ||
  process.env.CAPACITOR_PLATFORM != null ||
  process.env.MBS_NATIVE_RELEASE === "1" ||
  process.env.MBS_NATIVE_BUILD === "1";

const resolveEnvMode = (envMode, nativeFlag) => {
  if (nativeFlag) return "native";
  return envMode;
};

const buildEnvList = (envMode) => {
  const base = [".env", ".env.local"];
  const modeFiles = [`.env.${envMode}`, `.env.${envMode}.local`];
  if (envMode === "native") {
    return [
      ...base,
      ".env.production",
      ".env.production.local",
      ...modeFiles,
    ];
  }
  return [...base, ...modeFiles];
};

const ENV_FILES = buildEnvList(resolveEnvMode(mode, isNative));

const fileEnv = {};
const loadedFiles = [];

for (const file of ENV_FILES) {
  const fullPath = path.join(ROOT_DIR, file);
  if (!fs.existsSync(fullPath)) continue;
  const contents = fs.readFileSync(fullPath, "utf8");
  const parsed = dotenv.parse(contents);
  Object.assign(fileEnv, parsed);
  loadedFiles.push(file);
}

const allowlistedClientKeys = new Set([
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
  "VITE_FIREBASE_MEASUREMENT_ID",
]);

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

const scanForbiddenEnvLines = (files) => {
  const matches = [];
  const keyPattern = forbiddenKeys.join("|");
  const lineRegex = new RegExp(`^\\s*(?:export\\s+)?(${keyPattern})\\s*=`);
  for (const file of files) {
    const fullPath = path.join(ROOT_DIR, file);
    if (!fs.existsSync(fullPath)) continue;
    const contents = fs.readFileSync(fullPath, "utf8");
    const lines = contents.split(/\r?\n/);
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const match = lineRegex.exec(trimmed);
      if (!match) return;
      matches.push({
        file,
        line: idx + 1,
        key: match[1],
        text: trimmed,
      });
    });
  }
  return matches;
};

const forbiddenLineMatches = scanForbiddenEnvLines(ENV_FILES);

if (forbiddenLineMatches.length) {
  const sources = loadedFiles.length
    ? loadedFiles.join(", ")
    : "(no env files found)";
  const details = forbiddenLineMatches
    .map(
      (match) => `- ${match.file}:${match.line} (${match.key})`
    )
    .join("\n");
  const uniqueKeys = [
    ...new Set(forbiddenLineMatches.map((match) => match.key)),
  ];
  throw new Error(
    `Refusing to build with server secrets in client env files: ${uniqueKeys.join(", ")}.\n` +
      `Found in:\n${details}\n` +
      `Checked: ${sources}.\n` +
      "Move secrets to server-side config (functions/secrets) and remove them from .env files."
  );
}

const readClientEnvValue = (key) => {
  if (!allowlistedClientKeys.has(key)) return "";
  const fromProcess = String(process.env[key] ?? "").trim();
  if (fromProcess) return fromProcess;
  return String(fileEnv[key] ?? "").trim();
};

const requiredFirebaseKeys = isNative
  ? [
      "VITE_FIREBASE_API_KEY",
      "VITE_FIREBASE_AUTH_DOMAIN",
      "VITE_FIREBASE_PROJECT_ID",
    ]
  : [];

const missingFirebaseKeys = requiredFirebaseKeys.filter((key) => {
  return !readClientEnvValue(key);
});

if (missingFirebaseKeys.length) {
  const sources = loadedFiles.length
    ? loadedFiles.join(", ")
    : "(no env files found)";
  if (isNative) {
    console.error(
      "[config] Missing Firebase keys for native build. Ensure .env.native(.local) or .env.production(.local) supplies them.",
      missingFirebaseKeys
    );
    throw new Error(
      `Missing required Firebase env values: ${missingFirebaseKeys.join(", ")}. ` +
        `Checked: ${sources}.`
    );
  }
  console.warn(
    `[config] Missing Firebase env values for web build: ${missingFirebaseKeys.join(
      ", "
    )}. Build will continue; runtime config may be required.`
  );
}

const firebaseConfig = {
  apiKey: readClientEnvValue("VITE_FIREBASE_API_KEY"),
  authDomain: readClientEnvValue("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: readClientEnvValue("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: readClientEnvValue("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readClientEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readClientEnvValue("VITE_FIREBASE_APP_ID"),
  measurementId: readClientEnvValue("VITE_FIREBASE_MEASUREMENT_ID"),
};

const readEnvString = (...keys) => {
  for (const key of keys) {
    const value = String(process.env[key] ?? "").trim();
    if (value) return value;
  }
  return "";
};

const tryGit = (command) => {
  try {
    return execSync(command, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
};

const commit =
  readEnvString(
    "GIT_COMMIT",
    "GITHUB_SHA",
    "VERCEL_GIT_COMMIT_SHA",
    "CI_COMMIT_SHA"
  ) || tryGit("git rev-parse --short HEAD");

const branch =
  readEnvString(
    "GIT_BRANCH",
    "GITHUB_REF_NAME",
    "VERCEL_GIT_COMMIT_REF",
    "CI_COMMIT_REF_NAME"
  ) || tryGit("git rev-parse --abbrev-ref HEAD");

const resolveBuildTimestamp = () => {
  const epoch = readEnvString("SOURCE_DATE_EPOCH");
  if (epoch) {
    const asNumber = Number(epoch);
    if (Number.isFinite(asNumber)) {
      return new Date(asNumber * 1000).toISOString();
    }
  }
  const explicit = readEnvString("MBS_BUILD_TIME", "BUILD_TIMESTAMP");
  return explicit || "";
};

const timestamp = resolveBuildTimestamp();

const buildMeta = {
  mode,
  isNative,
  commit: commit || null,
  branch: branch || null,
  timestamp: timestamp || null,
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
