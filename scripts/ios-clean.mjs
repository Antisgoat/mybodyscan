import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, "package.json");
const derivedDataPath = path.join(
  os.homedir(),
  "Library",
  "Developer",
  "Xcode",
  "DerivedData"
);

const targets = [
  path.join(repoRoot, "ios/App/build"),
  path.join(repoRoot, "ios/App/DerivedData"),
  path.join(repoRoot, "ios/App/App/DerivedData"),
  derivedDataPath,
];

async function fail(message) {
  console.error(`[ios:clean] ${message}`);
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

async function main() {
  if (!(await fileExists(packageJsonPath))) {
    await fail("Missing package.json. Run from the repo root.");
  }

  for (const target of targets) {
    if (await fileExists(target)) {
      await fs.rm(target, { recursive: true, force: true });
      console.log(`[ios:clean] removed ${target}`);
    } else {
      console.log(`[ios:clean] skip ${target} (not found)`);
    }
  }
}

main().catch((error) => {
  fail(String(error?.stack || error?.message || error));
});
