import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, "package.json");
const publicIndex = path.join(repoRoot, "ios/App/App/public/index.html");
const capacitorConfigPath = path.join(repoRoot, "capacitor.config.ts");
const iosAppDir = path.join(repoRoot, "ios/App/App");
const iosWorkspace = path.join(repoRoot, "ios/App/App.xcworkspace");

const pluginPatterns = [
  "@capacitor-firebase/authentication",
  "capacitor-firebase/authentication",
];
const allowedPlugins = new Set([
  "@capacitor/app",
  "@capacitor/browser",
  "@revenuecat/purchases-capacitor",
]);

function fail(message) {
  console.error(`[smoke:native] FAIL: ${message}`);
  process.exit(1);
}

async function fileExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assertRepoRoot() {
  if (!(await fileExists(packageJsonPath))) {
    fail(`Missing ${packageJsonPath}. Run from repo root.`);
  }
}

async function assertPublicIndex() {
  if (!(await fileExists(publicIndex))) {
    fail(`Missing ${publicIndex}. Run npm run ios:reset or npx cap sync ios.`);
  }
  const stats = await fs.stat(publicIndex);
  if (stats.size < 1500) {
    fail(`ios/App/App/public/index.html is too small (${stats.size} bytes).`);
  }
}

async function assertWorkspace() {
  if (!(await fileExists(iosWorkspace))) {
    fail(`Missing ${iosWorkspace}. Run npm run ios:reset.`);
  }
}

function assertCapPlugins() {
  const result = spawnSync("npx", ["cap", "ls", "ios"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    const errText = (result.stderr || result.stdout || "").trim();
    fail(`npx cap ls ios failed: ${errText || "unknown error"}`);
  }
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const detectedPlugins = new Set();
  for (const line of output.split("\n")) {
    const match = line.trim().match(/^(@[^@\s]+\/[^@\s]+)@/);
    if (match) {
      detectedPlugins.add(match[1]);
    }
  }
  if (!detectedPlugins.size) {
    fail("Unable to parse plugins from npx cap ls ios output.");
  }
  for (const plugin of detectedPlugins) {
    if (!allowedPlugins.has(plugin)) {
      fail(`npx cap ls ios reports unexpected plugin: ${plugin}.`);
    }
  }
  for (const plugin of allowedPlugins) {
    if (!detectedPlugins.has(plugin)) {
      fail(`npx cap ls ios missing required plugin: ${plugin}.`);
    }
  }
  if (/capacitor-firebase/i.test(output)) {
    fail("npx cap ls ios reports a capacitor-firebase plugin. Remove native Firebase plugins.");
  }
  for (const pattern of pluginPatterns) {
    if (output.includes(pattern)) {
      fail(`npx cap ls ios reports disallowed plugin: ${pattern}.`);
    }
  }
}

async function assertNoServerUrl() {
  if (!(await fileExists(capacitorConfigPath))) {
    fail(`Missing ${capacitorConfigPath}. Run from repo root.`);
  }
  const contents = await fs.readFile(capacitorConfigPath, "utf8");
  const hasServerUrl =
    /server\s*:\s*\{[\s\S]*?url\s*:/m.test(contents) ||
    /server\.url/.test(contents);
  if (hasServerUrl) {
    fail("capacitor.config.ts contains server.url; remove dev server config.");
  }
}

async function assertNoSwiftFirebaseImports() {
  const entries = await fs.readdir(iosAppDir, { withFileTypes: true });
  const swiftFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".swift"))
    .map((entry) => path.join(iosAppDir, entry.name));
  const forbiddenSnippets = [
    "import Firebase",
    "import FirebaseCore",
    "FirebaseApp.configure",
    "FirebaseOptions",
  ];
  for (const file of swiftFiles) {
    const contents = await fs.readFile(file, "utf8");
    for (const snippet of forbiddenSnippets) {
      if (contents.includes(snippet)) {
        fail(
          `Swift Firebase usage detected (${snippet}): ${path.relative(
            repoRoot,
            file
          )}`
        );
      }
    }
  }
}

function assertNoCapFirebaseAuthPackage() {
  const result = spawnSync(
    "npm",
    ["ls", "@capacitor-firebase/authentication", "--depth=0", "--json"],
    {
      cwd: repoRoot,
      encoding: "utf8",
    }
  );
  const output = result.stdout || "{}";
  let data;
  try {
    data = JSON.parse(output);
  } catch {
    data = {};
  }
  if (data.dependencies && data.dependencies["@capacitor-firebase/authentication"]) {
    fail("npm ls reports @capacitor-firebase/authentication is installed.");
  }
}

function assertNoFirebaseStringsInIos() {
  const result = spawnSync(
    "rg",
    ["-n", "Firebase|FirebaseCore|FirebaseApp|FirebaseOptions", iosAppDir],
    { cwd: repoRoot, encoding: "utf8" }
  );
  if (result.status === 0) {
    fail("Firebase strings found in ios/App/App. Remove all native Firebase references.");
  }
  if (result.status !== 1) {
    fail(`rg failed while scanning ios/App/App: ${(result.stderr || "").trim()}`);
  }
}

async function main() {
  await assertRepoRoot();
  await assertWorkspace();
  await assertPublicIndex();
  assertCapPlugins();
  await assertNoServerUrl();
  await assertNoSwiftFirebaseImports();
  assertNoCapFirebaseAuthPackage();
  assertNoFirebaseStringsInIos();
  console.log("[smoke:native] PASS");
}

main().catch((error) => {
  fail(String(error?.stack || error?.message || error));
});
