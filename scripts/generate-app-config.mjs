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

const decodeXmlValue = (value) =>
  value
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const parseSimplePlistDict = (contents) => {
  const dictMatch = contents.match(/<dict>([\s\S]*?)<\/dict>/);
  if (!dictMatch) return {};
  const dictContent = dictMatch[1];
  const entries = {};
  const entryRegex =
    /<key>([^<]+)<\/key>\s*(?:<string>([^<]*)<\/string>|<integer>([^<]*)<\/integer>|<(true|false)\s*\/>)/g;
  let match = entryRegex.exec(dictContent);
  while (match) {
    const key = decodeXmlValue(match[1].trim());
    const rawValue = match[2] ?? match[3] ?? match[4] ?? "";
    entries[key] = decodeXmlValue(String(rawValue).trim());
    match = entryRegex.exec(dictContent);
  }
  return entries;
};

const readIosFirebaseConfig = () => {
  const plistPath = path.join(
    ROOT_DIR,
    "ios",
    "App",
    "App",
    "GoogleService-Info.plist"
  );
  if (!fs.existsSync(plistPath)) return null;
  const contents = fs.readFileSync(plistPath, "utf8");
  const dict = parseSimplePlistDict(contents);
  return {
    appId: dict.GOOGLE_APP_ID,
    apiKey: dict.API_KEY,
    projectId: dict.PROJECT_ID,
    messagingSenderId: dict.GCM_SENDER_ID,
    storageBucket: dict.STORAGE_BUCKET,
    measurementId: dict.MEASUREMENT_ID,
    source: path.relative(ROOT_DIR, plistPath),
  };
};

const readAndroidFirebaseConfig = () => {
  const paths = [
    path.join(ROOT_DIR, "android", "app", "google-services.json"),
    path.join(ROOT_DIR, "android", "app", "src", "main", "google-services.json"),
  ];
  const jsonPath = paths.find((candidate) => fs.existsSync(candidate));
  if (!jsonPath) return null;
  const contents = fs.readFileSync(jsonPath, "utf8");
  const parsed = JSON.parse(contents);
  const projectInfo = parsed.project_info || {};
  const client = Array.isArray(parsed.client) ? parsed.client[0] : null;
  const clientInfo = client?.client_info || {};
  const apiKey =
    Array.isArray(client?.api_key) && client.api_key[0]
      ? client.api_key[0].current_key
      : undefined;
  return {
    appId: clientInfo.mobilesdk_app_id,
    apiKey,
    projectId: projectInfo.project_id,
    messagingSenderId: projectInfo.project_number,
    storageBucket: projectInfo.storage_bucket,
    source: path.relative(ROOT_DIR, jsonPath),
  };
};

const readNativeFirebaseConfig = () => {
  const platform = String(process.env.CAPACITOR_PLATFORM ?? "").toLowerCase();
  const sources = [];
  const config = {};
  if (platform === "ios" || !platform) {
    const iosConfig = readIosFirebaseConfig();
    if (iosConfig) {
      sources.push(iosConfig.source);
      Object.assign(config, iosConfig);
    }
  }
  if (platform === "android" || !platform) {
    const androidConfig = readAndroidFirebaseConfig();
    if (androidConfig) {
      sources.push(androidConfig.source);
      for (const [key, value] of Object.entries(androidConfig)) {
        if (config[key] == null) {
          config[key] = value;
        }
      }
    }
  }
  if (!sources.length) return null;
  return { ...config, sources };
};

const firebaseConfig = {
  apiKey: readClientEnvValue("VITE_FIREBASE_API_KEY"),
  authDomain: readClientEnvValue("VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: readClientEnvValue("VITE_FIREBASE_PROJECT_ID"),
  storageBucket: readClientEnvValue("VITE_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: readClientEnvValue("VITE_FIREBASE_MESSAGING_SENDER_ID"),
  appId: readClientEnvValue("VITE_FIREBASE_APP_ID"),
  measurementId: readClientEnvValue("VITE_FIREBASE_MEASUREMENT_ID"),
};

const isMissingValue = (value) =>
  value === undefined || value === null || String(value).trim() === "";

const nativeConfig = isNative ? readNativeFirebaseConfig() : null;
const nativePlatform = String(process.env.CAPACITOR_PLATFORM ?? "").toLowerCase();
const buildNativeFileHint = () => {
  if (!isNative || nativeConfig?.sources?.length) return "";
  if (nativePlatform === "ios") {
    return (
      "\nMissing iOS Firebase config file: ios/App/App/GoogleService-Info.plist.\n" +
      "Download it from the Firebase console and place it at ios/App/App/GoogleService-Info.plist."
    );
  }
  if (nativePlatform === "android") {
    return (
      "\nMissing Android Firebase config file: android/app/google-services.json.\n" +
      "Download it from the Firebase console and place it at android/app/google-services.json."
    );
  }
  return (
    "\nMissing native Firebase config files: ios/App/App/GoogleService-Info.plist or android/app/google-services.json.\n" +
    "Download the platform file(s) from the Firebase console and place them at the paths above."
  );
};

if (isNative) {
  const nativeAppId = nativeConfig?.appId;
  if (!isMissingValue(nativeAppId)) {
    firebaseConfig.appId = nativeAppId;
  } else {
    const nativeSources = nativeConfig?.sources?.length
      ? nativeConfig.sources.join(", ")
      : "(no native Firebase files found)";
    throw new Error(
      "Missing Firebase appId for native build.\n" +
        `Checked native files: ${nativeSources}.` +
        buildNativeFileHint()
    );
  }
}

if (nativeConfig) {
  const mergeMap = {
    apiKey: nativeConfig.apiKey,
    projectId: nativeConfig.projectId,
    messagingSenderId: nativeConfig.messagingSenderId,
    storageBucket: nativeConfig.storageBucket,
    measurementId: nativeConfig.measurementId,
  };
  for (const [key, value] of Object.entries(mergeMap)) {
    if (isMissingValue(firebaseConfig[key]) && !isMissingValue(value)) {
      firebaseConfig[key] = value;
    }
  }
}

if (isNative && isMissingValue(firebaseConfig.authDomain)) {
  const projectId = firebaseConfig.projectId;
  if (!isMissingValue(projectId)) {
    firebaseConfig.authDomain = `${projectId}.firebaseapp.com`;
  }
}

const requiredFirebaseConfigKeys = isNative
  ? ["apiKey", "projectId", "authDomain", "appId"]
  : [];

const missingFirebaseConfig = requiredFirebaseConfigKeys.filter((key) =>
  isMissingValue(firebaseConfig[key])
);

if (missingFirebaseConfig.length) {
  const sources = loadedFiles.length
    ? loadedFiles.join(", ")
    : "(no env files found)";
  const nativeSources = nativeConfig?.sources?.length
    ? nativeConfig.sources.join(", ")
    : "(no native Firebase files found)";
  const nativeFileHint = buildNativeFileHint();
  if (isNative) {
    console.error(
      "[config] Missing Firebase keys for native build.",
      missingFirebaseConfig
    );
    throw new Error(
      `Missing required Firebase config values: ${missingFirebaseConfig.join(", ")}.\n` +
        `Checked env files: ${sources}.\n` +
        `Checked native files: ${nativeSources}.\n` +
        `Provide VITE_FIREBASE_* values or add Firebase native config files with client settings.` +
        nativeFileHint
    );
  }
  console.warn(
    `[config] Missing Firebase config values for web build: ${missingFirebaseConfig.join(
      ", "
    )}. Build will continue; runtime config may be required.`
  );
}

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
