import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, "package.json");
const publicIndex = path.join(repoRoot, "ios/App/App/public/index.html");
const capacitorConfigPath = path.join(repoRoot, "capacitor.config.ts");
const iosAppDir = path.join(repoRoot, "ios/App/App");

const pluginPatterns = [
  "@capacitor-firebase/authentication",
  "capacitor-firebase/authentication",
];

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
  for (const file of swiftFiles) {
    const contents = await fs.readFile(file, "utf8");
    if (contents.includes("import FirebaseCore")) {
      fail(`Swift FirebaseCore import detected: ${path.relative(repoRoot, file)}`);
    }
  }
}

async function main() {
  await assertRepoRoot();
  await assertPublicIndex();
  assertCapPlugins();
  await assertNoServerUrl();
  await assertNoSwiftFirebaseImports();
  console.log("[smoke:native] PASS");
}

main().catch((error) => {
  fail(String(error?.stack || error?.message || error));
});
