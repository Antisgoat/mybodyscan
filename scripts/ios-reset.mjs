import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, "package.json");
const distDir = path.join(repoRoot, "dist");
const iosPublicDir = path.join(repoRoot, "ios/App/App/public");
const iosAppDir = path.join(repoRoot, "ios/App");
const workspacePath = path.join(repoRoot, "ios/App/App.xcworkspace");

function fail(message) {
  console.error(`[ios:reset] FAIL: ${message}`);
  process.exit(1);
}

async function ensureRepoRoot() {
  try {
    await fs.stat(packageJsonPath);
  } catch {
    fail(`Missing ${packageJsonPath}. Run from the repo root.`);
  }
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: repoRoot,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    fail(`${cmd} ${args.join(" ")} failed with status ${result.status}`);
  }
}

async function resetDirectories() {
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.rm(iosPublicDir, { recursive: true, force: true });
}

function ensureCommand(command) {
  const result = spawnSync(command, ["--version"], {
    stdio: "ignore",
  });
  if (result.status !== 0) {
    fail(`Missing required command: ${command}`);
  }
}

async function main() {
  await ensureRepoRoot();
  await resetDirectories();

  run("node", ["scripts/assert-repo-root.mjs"]);
  run("npm", ["run", "build:native"]);
  run("npx", ["cap", "sync", "ios"]);
  run("node", ["scripts/assert-ios-public-bundle.mjs"]);

  ensureCommand("pod");
  run("pod", ["install"], { cwd: iosAppDir });

  const openResult = spawnSync("open", [workspacePath], { stdio: "ignore" });
  if (openResult.status !== 0) {
    console.warn(
      "[ios:reset] warn: 'open' unavailable. Open ios/App/App.xcworkspace manually."
    );
  }

  console.log("[ios:reset] OK");
}

main().catch((error) => {
  fail(String(error?.stack || error?.message || error));
});
