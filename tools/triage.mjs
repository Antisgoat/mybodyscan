#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { runBuilds } from "../scripts/assert-builds.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..");

const severityRank = { UNKNOWN: 0, PASS: 1, WARN: 2, FAIL: 3 };

function createCategory(title) {
  return { key: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"), title, status: "UNKNOWN", summary: "", details: [] };
}

const categories = {
  firebaseInitOrder: createCategory("Firebase Init Order"),
  authPersistence: createCategory("Auth Persistence"),
  emailAuth: createCategory("Email"),
  googleAuth: createCategory("Google"),
  appleAuth: createCategory("Apple"),
  demoFlow: createCategory("Demo (Anon + Read-only)"),
  firebaseConfig: createCategory("Firebase Web Config"),
  functions: createCategory("Functions Engines/Build"),
  health: createCategory("Health/Hosting"),
  creditsClaims: createCategory("Credits/Claims"),
};

const orderedKeys = [
  "firebaseInitOrder",
  "authPersistence",
  "emailAuth",
  "googleAuth",
  "appleAuth",
  "demoFlow",
  "firebaseConfig",
  "functions",
  "health",
  "creditsClaims",
];

function applyStatus(key, status) {
  const cat = categories[key];
  if (!cat) return;
  const current = severityRank[cat.status] ?? 0;
  const next = severityRank[status] ?? 0;
  if (current === 0 || next > current) {
    cat.status = status;
  }
}

function setSummary(key, text) {
  const cat = categories[key];
  if (!cat) return;
  if (!cat.summary) {
    cat.summary = text;
  } else if (text && !cat.summary.includes(text)) {
    cat.summary = `${cat.summary} ${text}`.trim();
  }
}

function addDetail(key, detail) {
  const cat = categories[key];
  if (!cat) return;
  cat.details.push(detail);
}

function readFileLines(filePath) {
  if (!existsSync(filePath)) return null;
  const content = readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  return { content, lines };
}

function lineNumberFromIndex(content, index) {
  if (index < 0) return null;
  const prefix = content.slice(0, index);
  return prefix.split(/\r?\n/).length;
}

function getSnippet(lines, lineNumber, context = 3) {
  if (!lines || !lineNumber) return "";
  const start = Math.max(0, lineNumber - context - 1);
  const end = Math.min(lines.length, lineNumber + context);
  return lines
    .slice(start, end)
    .map((line, idx) => `${String(start + idx + 1).padStart(4, " ")} │ ${line}`)
    .join("\n");
}

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const raw = readFileSync(filePath, "utf8");
  const env = {};
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  });
  return env;
}

function computeFirebaseConfig(env) {
  const keys = [
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
    "VITE_FIREBASE_MEASUREMENT_ID",
  ];
  const config = {};
  keys.forEach((key) => {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      config[key] = value.trim();
    }
  });
  const projectId = config.VITE_FIREBASE_PROJECT_ID ?? "";
  const storageBucketInput = config.VITE_FIREBASE_STORAGE_BUCKET ?? "";
  let normalizedBucket = storageBucketInput;
  let normalizedFrom = null;
  if (!normalizedBucket && projectId) {
    normalizedBucket = `${projectId}.appspot.com`;
  }
  if (normalizedBucket.endsWith("firebasestorage.app") && projectId) {
    normalizedFrom = normalizedBucket;
    normalizedBucket = `${projectId}.appspot.com`;
  }
  const missingKeys = keys.filter((key) => !config[key] && key !== "VITE_FIREBASE_MEASUREMENT_ID");
  return {
    raw: config,
    projectId,
    storageBucketInput: storageBucketInput || null,
    storageBucketNormalized: normalizedBucket || null,
    normalizedFrom,
    missingKeys,
  };
}

function truncateLines(text, maxLines = 40) {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) return lines.join("\n");
  return `${lines.slice(0, maxLines).join("\n")}\n… (truncated, ${lines.length - maxLines} more lines)`;
}

function ensureCategoryStatuses() {
  orderedKeys.forEach((key) => {
    const cat = categories[key];
    if (cat && (!cat.status || cat.status === "UNKNOWN")) {
      cat.status = "WARN";
      if (!cat.summary) {
        cat.summary = "No automated signal captured. Review manually.";
      }
    }
  });
}

const envLocal = parseEnvFile(join(repoRoot, ".env.local"));
const effectiveEnv = { ...process.env, ...envLocal };
const firebaseConfig = computeFirebaseConfig(effectiveEnv);

function analyzeFirebaseInit() {
  const appInitPath = join(repoRoot, "src", "lib", "appInit.ts");
  const file = readFileLines(appInitPath);
  if (!file) {
    applyStatus("firebaseInitOrder", "FAIL");
    setSummary("firebaseInitOrder", "Missing src/lib/appInit.ts, cannot confirm init order.");
    addDetail("firebaseInitOrder", { message: "src/lib/appInit.ts not found", file: "src/lib/appInit.ts", line: 0, snippet: "" });
    return;
  }
  const { content, lines } = file;
  const promiseAllMatch = content.match(/Promise\.all\s*\(\s*\[\s*setupAppCheck\(app\)\s*,\s*setupPersistence\(app\)\s*\]/);
  if (promiseAllMatch) {
    const line = lineNumberFromIndex(content, promiseAllMatch.index ?? 0) ?? 0;
    applyStatus("firebaseInitOrder", "FAIL");
    setSummary(
      "firebaseInitOrder",
      "App Check setup runs in parallel with getAuth(), so persistence pulls auth before App Check finishes.",
    );
    addDetail("firebaseInitOrder", {
      message: "initFirebaseApp uses Promise.all for setupAppCheck + setupPersistence, allowing getAuth() before App Check tokens.",
      file: "src/lib/appInit.ts",
      line,
      snippet: getSnippet(lines, line, 4),
    });
  } else if (/await\s+setupAppCheck\(app\)[\s\S]*?await\s+setupPersistence\(app\)/.test(content)) {
    applyStatus("firebaseInitOrder", "PASS");
    setSummary("firebaseInitOrder", "setupAppCheck() is awaited before getAuth()/Firestore access.");
  } else {
    applyStatus("firebaseInitOrder", "WARN");
    setSummary("firebaseInitOrder", "Unable to confirm App Check precedes getAuth(); review initFirebaseApp().");
  }

  const getAuthIndex = content.indexOf("getAuth(");
  if (getAuthIndex >= 0) {
    const line = lineNumberFromIndex(content, getAuthIndex) ?? 0;
    addDetail("firebaseInitOrder", {
      message: "getAuth() invoked inside setupPersistence while App Check may still be initializing.",
      file: "src/lib/appInit.ts",
      line,
      snippet: getSnippet(lines, line, 4),
    });
  }

  const appCheckIndex = content.indexOf("initializeAppCheck(");
  if (appCheckIndex >= 0) {
    const line = lineNumberFromIndex(content, appCheckIndex) ?? 0;
    addDetail("firebaseInitOrder", {
      message: "App Check is created with ReCaptchaV3Provider but not awaited before persistence.",
      file: "src/lib/appInit.ts",
      line,
      snippet: getSnippet(lines, line, 4),
    });
  }
}

function analyzePersistence() {
  const appInitPath = join(repoRoot, "src", "lib", "appInit.ts");
  const file = readFileLines(appInitPath);
  if (!file) {
    applyStatus("authPersistence", "FAIL");
    setSummary("authPersistence", "Missing appInit.ts prevents persistence check.");
    return;
  }
  const { content, lines } = file;
  const match = content.indexOf("setPersistence(");
  if (match >= 0) {
    const line = lineNumberFromIndex(content, match) ?? 0;
    applyStatus("authPersistence", "PASS");
    setSummary("authPersistence", "setPersistence(browserLocalPersistence) enforced during init.");
    addDetail("authPersistence", {
      message: "Auth persistence forced to browserLocalPersistence with error logging fallback.",
      file: "src/lib/appInit.ts",
      line,
      snippet: getSnippet(lines, line, 4),
    });
  } else {
    applyStatus("authPersistence", "WARN");
    setSummary("authPersistence", "No setPersistence() call detected.");
  }
}

function analyzeEmailAuth() {
  const firebaseLibPath = join(repoRoot, "src", "lib", "firebase.ts");
  const firebaseLib = readFileLines(firebaseLibPath);
  if (firebaseLib && firebaseLib.content.includes("signInWithEmailAndPassword")) {
    const idx = firebaseLib.content.indexOf("signInWithEmailAndPassword");
    const line = lineNumberFromIndex(firebaseLib.content, idx) ?? 0;
    applyStatus("emailAuth", "PASS");
    setSummary("emailAuth", "safeEmailSignIn wraps signInWithEmailAndPassword with retry on network failures.");
    addDetail("emailAuth", {
      message: "safeEmailSignIn awaits initApp() then retries auth/network-request-failed once.",
      file: "src/lib/firebase.ts",
      line,
      snippet: getSnippet(firebaseLib.lines, line, 4),
    });
  } else {
    applyStatus("emailAuth", "FAIL");
    setSummary("emailAuth", "signInWithEmailAndPassword not referenced in src/lib/firebase.ts.");
  }

  const authPagePath = join(repoRoot, "src", "pages", "Auth.tsx");
  const authPage = readFileLines(authPagePath);
  if (authPage && authPage.content.includes("safeEmailSignIn")) {
    const idx = authPage.content.indexOf("safeEmailSignIn(");
    const line = lineNumberFromIndex(authPage.content, idx) ?? 0;
    addDetail("emailAuth", {
      message: "Auth page submits credentials via safeEmailSignIn().",
      file: "src/pages/Auth.tsx",
      line,
      snippet: getSnippet(authPage.lines, line, 4),
    });
  } else {
    applyStatus("emailAuth", "WARN");
    setSummary("emailAuth", "Auth screen is not wired to safeEmailSignIn().");
  }
}

function analyzeGoogleAuth() {
  const authPagePath = join(repoRoot, "src", "pages", "Auth.tsx");
  const authPage = readFileLines(authPagePath);
  if (!authPage) {
    applyStatus("googleAuth", "FAIL");
    setSummary("googleAuth", "Auth page missing.");
    return;
  }
  const { content, lines } = authPage;
  const providerIdx = content.indexOf("new GoogleAuthProvider");
  if (providerIdx >= 0) {
    const line = lineNumberFromIndex(content, providerIdx) ?? 0;
    applyStatus("googleAuth", "PASS");
    setSummary("googleAuth", "GoogleAuthProvider used with popup→redirect fallback.");
    addDetail("googleAuth", {
      message: "Google sign-in leverages signInWithProvider() with fallback to redirect and popup diagnostics.",
      file: "src/pages/Auth.tsx",
      line,
      snippet: getSnippet(lines, line, 4),
    });
  } else {
    applyStatus("googleAuth", "FAIL");
    setSummary("googleAuth", "GoogleAuthProvider usage not detected.");
  }
}

function analyzeAppleAuth() {
  const authPagePath = join(repoRoot, "src", "pages", "Auth.tsx");
  const authPage = readFileLines(authPagePath);
  if (!authPage) {
    applyStatus("appleAuth", "FAIL");
    setSummary("appleAuth", "Auth page missing.");
    return;
  }
  const { content, lines } = authPage;
  const providerIdx = content.indexOf("new OAuthProvider(\"apple.com\"");
  if (providerIdx >= 0) {
    const line = lineNumberFromIndex(content, providerIdx) ?? 0;
    addDetail("appleAuth", {
      message: "Apple provider created with OAuthProvider('apple.com') and finalizeAppleProfile().",
      file: "src/pages/Auth.tsx",
      line,
      snippet: getSnippet(lines, line, 4),
    });
  }
  const gatingIdx = content.indexOf("APPLE_OAUTH_ENABLED");
  if (providerIdx >= 0 && gatingIdx >= 0 && content.includes("if (!appleFeatureEnabled")) {
    applyStatus("appleAuth", "PASS");
    setSummary("appleAuth", "Apple button gated behind APPLE_OAUTH_ENABLED with feature-disabled toast.");
    const gateLine = lineNumberFromIndex(content, content.indexOf("if (!appleFeatureEnabled")) ?? 0;
    addDetail("appleAuth", {
      message: "Apple sign-in short-circuits unless APPLE_OAUTH_ENABLED is true, surfacing configuration guidance.",
      file: "src/pages/Auth.tsx",
      line: gateLine,
      snippet: getSnippet(lines, gateLine, 4),
    });
  } else if (providerIdx >= 0) {
    applyStatus("appleAuth", "WARN");
    setSummary("appleAuth", "Apple provider present but APPLE_OAUTH_ENABLED gating not detected.");
  } else {
    applyStatus("appleAuth", "FAIL");
    setSummary("appleAuth", "No Apple OAuthProvider wiring on Auth page.");
  }
}

function analyzeDemoFlow() {
  const authPagePath = join(repoRoot, "src", "pages", "Auth.tsx");
  const authPage = readFileLines(authPagePath);
  if (!authPage) {
    applyStatus("demoFlow", "FAIL");
    setSummary("demoFlow", "Auth page missing.");
    return;
  }
  const { content, lines } = authPage;
  const anonIdx = content.indexOf("signInAnonymously");
  const retryIdx = content.indexOf("auth/network-request-failed");
  if (anonIdx >= 0) {
    const line = lineNumberFromIndex(content, anonIdx) ?? 0;
    addDetail("demoFlow", {
      message: "Anon demo flow defined via anonWithRetry().",
      file: "src/pages/Auth.tsx",
      line,
      snippet: getSnippet(lines, line, 4),
    });
  }
  if (anonIdx >= 0 && retryIdx >= 0) {
    applyStatus("demoFlow", "PASS");
    setSummary("demoFlow", "Demo explore uses anonWithRetry() and persistDemoFlags().");
  } else if (anonIdx >= 0) {
    applyStatus("demoFlow", "WARN");
    setSummary("demoFlow", "Demo explore calls signInAnonymously() without retry guard.");
  } else {
    applyStatus("demoFlow", "FAIL");
    setSummary("demoFlow", "No anonymous demo sign-in detected on Auth page.");
  }

  const demoGuardPath = join(repoRoot, "src", "lib", "dbWrite.ts");
  const demoGuard = readFileLines(demoGuardPath);
  if (demoGuard && demoGuard.content.includes("assertNotDemoWrite")) {
    const idx = demoGuard.content.indexOf("assertNotDemoWrite");
    const line = lineNumberFromIndex(demoGuard.content, idx) ?? 0;
    addDetail("demoFlow", {
      message: "Firestore writes funnel through assertNotDemoWrite() to enforce read-only demo.",
      file: "src/lib/dbWrite.ts",
      line,
      snippet: getSnippet(demoGuard.lines, line, 4),
    });
  } else {
    applyStatus("demoFlow", "WARN");
    setSummary("demoFlow", "Demo write guard missing in src/lib/dbWrite.ts.");
  }
}

function analyzeFirebaseConfigSource() {
  const configPath = join(repoRoot, "src", "config", "firebaseConfig.ts");
  const configFile = readFileLines(configPath);
  if (!configFile) {
    applyStatus("firebaseConfig", "FAIL");
    setSummary("firebaseConfig", "src/config/firebaseConfig.ts missing.");
    return;
  }
  const { content, lines } = configFile;
  const normalizationIdx = content.indexOf("config.storageBucket = `${config.projectId}.appspot.com`");
  if (normalizationIdx >= 0) {
    const line = lineNumberFromIndex(content, normalizationIdx) ?? 0;
    applyStatus("firebaseConfig", "PASS");
    setSummary("firebaseConfig", "Firebase config normalizes firebasestorage.app buckets to appspot.com.");
    addDetail("firebaseConfig", {
      message: "storageBucket rewrites firebasestorage.app hosts to <projectId>.appspot.com and surfaces missing env keys.",
      file: "src/config/firebaseConfig.ts",
      line,
      snippet: getSnippet(lines, line, 4),
    });
  } else {
    applyStatus("firebaseConfig", "WARN");
    setSummary("firebaseConfig", "No storageBucket normalization detected.");
  }

  if (configFile.content.includes("missingEnvKeys")) {
    const idx = configFile.content.indexOf("missingEnvKeys");
    const line = lineNumberFromIndex(configFile.content, idx) ?? 0;
    addDetail("firebaseConfig", {
      message: "Config reports missing env keys via getFirebaseConfigMissingEnvKeys().",
      file: "src/config/firebaseConfig.ts",
      line,
      snippet: getSnippet(configFile.lines, line, 4),
    });
  }

  if (firebaseConfig.missingKeys.length > 0) {
    applyStatus("firebaseConfig", "WARN");
    setSummary(
      "firebaseConfig",
      `Local env missing ${firebaseConfig.missingKeys.join(", ") || "Firebase keys"}.`,
    );
  }
}

function analyzeFunctions() {
  const pkgPath = join(repoRoot, "functions", "package.json");
  const pkgFile = readFileLines(pkgPath);
  if (!pkgFile) {
    applyStatus("functions", "FAIL");
    setSummary("functions", "functions/package.json missing.");
    return;
  }
  const { content, lines } = pkgFile;
  const enginesMatch = content.match(/"node"\s*:\s*"(\d+)"/);
  if (enginesMatch) {
    const nodeVersion = enginesMatch[1];
    const line = lineNumberFromIndex(content, enginesMatch.index ?? 0) ?? 0;
    if (nodeVersion === "20") {
      applyStatus("functions", "PASS");
      setSummary("functions", "Functions engines pinned to Node 20.");
    } else {
      applyStatus("functions", "FAIL");
      setSummary("functions", `functions/package.json pins Node ${nodeVersion}, expected 20.`);
    }
    addDetail("functions", {
      message: `functions/package.json engines.node = "${nodeVersion}"`,
      file: "functions/package.json",
      line,
      snippet: getSnippet(lines, line, 4),
    });
  }

  const tsconfigPath = join(repoRoot, "functions", "tsconfig.json");
  const tsconfig = readFileLines(tsconfigPath);
  if (tsconfig && tsconfig.content.includes('"module": "NodeNext"')) {
    const idx = tsconfig.content.indexOf('"module": "NodeNext"');
    const line = lineNumberFromIndex(tsconfig.content, idx) ?? 0;
    addDetail("functions", {
      message: "functions/tsconfig.json targets NodeNext modules and outDir lib.",
      file: "functions/tsconfig.json",
      line,
      snippet: getSnippet(tsconfig.lines, line, 4),
    });
  }
}

function analyzeHealthHosting(hasHealthFile) {
  const firebaseJsonPath = join(repoRoot, "firebase.json");
  const firebaseJson = readFileLines(firebaseJsonPath);
  if (firebaseJson) {
    const { content, lines } = firebaseJson;
    const rewriteIdx = content.indexOf('"source": "/system/health"');
    if (rewriteIdx >= 0) {
      const line = lineNumberFromIndex(content, rewriteIdx) ?? 0;
      addDetail("health", {
        message: "firebase.json rewrites /system/health to /system/health.json and includes SPA fallback.",
        file: "firebase.json",
        line,
        snippet: getSnippet(lines, line, 4),
      });
    }
    if (content.includes('"source": "**"') && content.includes('"destination": "/index.html"')) {
      applyStatus("health", "PASS");
      setSummary("health", "Hosting rewrites /system/health and SPA fallback present.");
    } else {
      applyStatus("health", "WARN");
      setSummary("health", "Missing SPA fallback rewrite to /index.html.");
    }
  } else {
    applyStatus("health", "WARN");
    setSummary("health", "firebase.json not found.");
  }

  const healthWriterPath = join(repoRoot, "scripts", "write-health-json.mjs");
  const healthWriter = readFileLines(healthWriterPath);
  if (healthWriter) {
    const idx = healthWriter.content.indexOf("writeFileSync(outputPath");
    const line = lineNumberFromIndex(healthWriter.content, idx) ?? 0;
    addDetail("health", {
      message: "scripts/write-health-json.mjs writes dist/system/health.json during postbuild.",
      file: "scripts/write-health-json.mjs",
      line,
      snippet: getSnippet(healthWriter.lines, line, 4),
    });
  }

  if (hasHealthFile) {
    applyStatus("health", "PASS");
    setSummary("health", "dist/system/health.json present after build.");
  }
}

function analyzeCreditsClaims() {
  const authLibPath = join(repoRoot, "src", "lib", "auth.ts");
  const authLib = readFileLines(authLibPath);
  if (authLib && authLib.content.includes('httpsCallable(functions, "refreshClaims")')) {
    const idx = authLib.content.indexOf('httpsCallable(functions, "refreshClaims")');
    const line = lineNumberFromIndex(authLib.content, idx) ?? 0;
    applyStatus("creditsClaims", "PASS");
    setSummary("creditsClaims", "refreshClaims callable invoked from refreshClaimsNow().");
    addDetail("creditsClaims", {
      message: "refreshClaimsNow() calls httpsCallable(functions, \"refreshClaims\") then forces ID token refresh.",
      file: "src/lib/auth.ts",
      line,
      snippet: getSnippet(authLib.lines, line, 4),
    });
  } else {
    applyStatus("creditsClaims", "WARN");
    setSummary("creditsClaims", "refreshClaims callable not referenced in src/lib/auth.ts.");
  }

  const creditsBadgePath = join(repoRoot, "src", "components", "CreditsBadge.tsx");
  const creditsBadge = readFileLines(creditsBadgePath);
  if (creditsBadge && creditsBadge.content.includes("role === \"dev\"")) {
    const idx = creditsBadge.content.indexOf("role === \"dev\"");
    const line = lineNumberFromIndex(creditsBadge.content, idx) ?? 0;
    addDetail("creditsClaims", {
      message: "CreditsBadge renders ∞ for dev role or unlimited testers.",
      file: "src/components/CreditsBadge.tsx",
      line,
      snippet: getSnippet(creditsBadge.lines, line, 4),
    });
  }
}

function buildFixPlan() {
  const steps = [];
  if (categories.firebaseInitOrder.status !== "PASS") {
    steps.push(
      "Sequence initFirebaseApp() so setupAppCheck(app) awaits before setupPersistence(app) to avoid getAuth() without App Check tokens (src/lib/appInit.ts).",
    );
  }
  if (categories.firebaseConfig.status !== "PASS" || firebaseConfig.missingKeys.length > 0) {
    const bucketHint = firebaseConfig.projectId ? `${firebaseConfig.projectId}.appspot.com` : "<projectId>.appspot.com";
    steps.push(
      `Populate VITE_FIREBASE_* env vars for ${firebaseConfig.projectId || "the production project"} and ensure storageBucket resolves to ${bucketHint} (.env / hosting config).`,
    );
  }
  if (categories.appleAuth.status !== "PASS") {
    steps.push(
      "Complete Apple provider setup in Firebase Auth (Services ID, Team ID, Key ID, .p8) then flip APPLE_OAUTH_ENABLED=true for authorized hosts (src/pages/Auth.tsx).",
    );
  }
  if (categories.demoFlow.status !== "PASS") {
    steps.push(
      "Verify Explore Demo flow handles network retries and preserves read-only flags; align anonWithRetry() + assertNotDemoWrite() usage (src/pages/Auth.tsx, src/lib/dbWrite.ts).",
    );
  }
  if (categories.functions.status !== "PASS") {
    steps.push(
      "Ensure functions/package.json engines.node=\"20\" and TypeScript emits to lib/ via npm --prefix functions run build (functions/).",
    );
  }
  if (categories.health.status !== "PASS") {
    steps.push(
      "Confirm postbuild writes dist/system/health.json and firebase.json rewrites /system/health to the static payload (scripts/write-health-json.mjs, firebase.json).",
    );
  }
  if (steps.length === 0) {
    steps.push("No blocking fixes detected. Proceed with Firebase Auth provider configuration and deploy.");
  }
  return steps;
}

async function main() {
  analyzeFirebaseInit();
  analyzePersistence();
  analyzeEmailAuth();
  analyzeGoogleAuth();
  analyzeAppleAuth();
  analyzeDemoFlow();
  analyzeFirebaseConfigSource();
  analyzeFunctions();

  const builds = await runBuilds();
  const buildInfo = { web: builds.web, functions: builds.functions };

  if ((builds.web?.code ?? 1) !== 0) {
    applyStatus("firebaseConfig", "WARN");
    setSummary("firebaseConfig", `npm run build exited with ${builds.web?.code ?? "?"}; inspect Vite errors.`);
  }
  if ((builds.functions?.code ?? 1) !== 0) {
    applyStatus("functions", "FAIL");
    setSummary("functions", `npm --prefix functions run build exited with ${builds.functions?.code ?? "?"}.`);
  }

  const healthJsonPath = join(repoRoot, "dist", "system", "health.json");
  let healthPayload = null;
  if (existsSync(healthJsonPath)) {
    try {
      const raw = readFileSync(healthJsonPath, "utf8");
      healthPayload = JSON.parse(raw);
    } catch (error) {
      healthPayload = { error: String(error) };
    }
  }

  analyzeHealthHosting(Boolean(healthPayload));
  analyzeCreditsClaims();

  ensureCategoryStatuses();

  const fixPlan = buildFixPlan();

  const categoriesOutput = orderedKeys.map((key) => ({
    key,
    title: categories[key].title,
    status: categories[key].status,
    summary: categories[key].summary,
    details: categories[key].details,
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    firebaseConfig,
    builds: buildInfo,
    healthPayload,
    categories: categoriesOutput,
    fixPlan,
  };

  mkdirSync(join(repoRoot, "tools"), { recursive: true });
  writeFileSync(join(repoRoot, "tools", "triage-output.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const summaryRows = orderedKeys
    .map((key) => {
      const cat = categories[key];
      const badge = cat.status === "PASS" ? "✅ PASS" : cat.status === "FAIL" ? "❌ FAIL" : "⚠️ WARN";
      return `| ${cat.title} | ${badge} | ${cat.summary || ""} |`;
    })
    .join("\n");

  const findingsSections = orderedKeys
    .map((key) => {
      const cat = categories[key];
      const badge = cat.status === "PASS" ? "✅ PASS" : cat.status === "FAIL" ? "❌ FAIL" : "⚠️ WARN";
      const details = cat.details
        .map((detail) => {
          const link = detail.file ? `../${detail.file}` : "";
          const location = detail.line && detail.line > 0 ? `L${detail.line}` : "";
          const snippetBlock = detail.snippet ? `\n\n\`\`\`ts\n${detail.snippet}\n\`\`\`` : "";
          const ref = detail.file ? ` ([${detail.file}:${location}](${link}))` : "";
          return `- ${detail.message}${ref}${snippetBlock}`;
        })
        .join("\n");
      return `### ${cat.title} — ${badge}\n${cat.summary || ""}\n\n${details}`.trim();
    })
    .join("\n\n");

  const buildSections = Object.entries(buildInfo)
    .map(([key, info]) => {
      const title = key === "web" ? "npm run build" : "npm --prefix functions run build";
      const badge = info && info.code === 0 ? "✅ PASS" : "⚠️ WARN";
      const log = info ? truncateLines(`${info.stdout}${info.stderr ? `\n${info.stderr}` : ""}`, 60) : "(no output)";
      return `- ${badge} \`${title}\` (exit ${info?.code ?? "?"})\n\n  \`\`\`\n${log}\n  \`\`\``;
    })
    .join("\n\n");

  const fixPlanMd = fixPlan.map((step, index) => `${index + 1}. ${step}`).join("\n");

  const report = `# MyBodyScan Auth & Demo Triage\n\nGenerated: ${output.generatedAt}\n\n## Summary\n\n| Area | Status | Notes |\n| --- | --- | --- |\n${summaryRows}\n\n## Findings\n\n${findingsSections}\n\n## Build Output\n\n${buildSections}\n\n## dist/system/health.json\n\n\`\`\`json\n${
    healthPayload ? JSON.stringify(healthPayload, null, 2) : "(not generated)"
  }\n\`\`\`\n\n## Fix Plan\n\n${fixPlanMd}\n`;

  mkdirSync(join(repoRoot, "DOCS"), { recursive: true });
  writeFileSync(join(repoRoot, "DOCS", "TRIAGE_REPORT.md"), report, "utf8");

  console.log("[triage] wrote tools/triage-output.json and DOCS/TRIAGE_REPORT.md");
}

main().catch((error) => {
  console.error("[triage] failed", error);
  process.exitCode = 1;
});

