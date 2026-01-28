import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, "package.json");
const publicIndex = path.join(repoRoot, "ios/App/App/public/index.html");
const firebasePlistCandidates = [
  path.join(repoRoot, "ios/App/App/GoogleService-Info.plist"),
  path.join(repoRoot, "ios/App/App/App/GoogleService-Info.plist"),
];

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
  if (stats.size < 500) {
    fail(`ios/App/App/public/index.html is too small (${stats.size} bytes).`);
  }
}

async function assertFirebasePlist() {
  let plistPath = null;
  for (const candidate of firebasePlistCandidates) {
    if (await fileExists(candidate)) {
      plistPath = candidate;
      break;
    }
  }
  if (!plistPath) {
    fail("Missing GoogleService-Info.plist in ios/App/App or ios/App/App/App.");
  }
  const contents = await fs.readFile(plistPath, "utf8");
  if (contents.includes("REPLACE_ME") || contents.includes("YOUR_")) {
    fail(`GoogleService-Info.plist contains placeholder values at ${plistPath}.`);
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

async function main() {
  await assertRepoRoot();
  await assertPublicIndex();
  await assertFirebasePlist();
  assertCapPlugins();
  console.log("[smoke:native] PASS");
}

main().catch((error) => {
  fail(String(error?.stack || error?.message || error));
});
