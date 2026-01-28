import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const publicIndex = path.join(repoRoot, "ios/App/App/public/index.html");
const firebasePlist = path.join(
  repoRoot,
  "ios/App/App/GoogleService-Info.plist"
);
const capConfig = path.join(repoRoot, "ios/App/App/capacitor.config.json");

const pluginPatterns = [
  "@capacitor-firebase/authentication",
  "capacitor-firebase/authentication",
  "CapacitorFirebaseAuthentication",
  "FirebaseAuthentication",
];

function fail(message) {
  console.error(`[smoke:native] ${message}`);
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

async function assertPublicIndex() {
  if (!(await fileExists(publicIndex))) {
    fail(`Missing ${publicIndex}. Run npm run ios:reset or npx cap sync ios.`);
  }
  const contents = await fs.readFile(publicIndex, "utf8");
  if (contents.includes("Placeholder. Run npm run ios:sync")) {
    fail(
      "ios/App/App/public/index.html is still the placeholder. Run npm run build:native && npx cap sync ios."
    );
  }
}

async function assertFirebasePlist() {
  if (!(await fileExists(firebasePlist))) {
    fail("Missing ios/App/App/GoogleService-Info.plist.");
  }
  const contents = await fs.readFile(firebasePlist, "utf8");
  if (contents.includes("REPLACE_ME")) {
    fail("GoogleService-Info.plist still contains REPLACE_ME placeholders.");
  }
}

async function assertCapacitorConfig() {
  if (!(await fileExists(capConfig))) {
    fail("Missing ios/App/App/capacitor.config.json.");
  }
  const contents = await fs.readFile(capConfig, "utf8");
  for (const pattern of pluginPatterns) {
    if (contents.includes(pattern)) {
      fail(`capacitor.config.json still references ${pattern}.`);
    }
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
      fail(`npx cap ls ios still reports ${pattern}.`);
    }
  }
}

async function main() {
  await assertPublicIndex();
  await assertFirebasePlist();
  await assertCapacitorConfig();
  assertCapPlugins();
  console.log("[smoke:native] OK");
}

main().catch((error) => {
  fail(String(error?.stack || error?.message || error));
});
