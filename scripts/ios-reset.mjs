import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const REQUIRED_FILES = ["package.json", "capacitor.config.ts"];

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function findRepoRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    const matches = REQUIRED_FILES.every((file) => fileExists(path.join(current, file)));
    if (matches) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function runCommand(label, command, args, options = {}) {
  console.log(`\n[ios-reset] ${label}`);
  console.log(`[ios-reset] $ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function removePath(targetPath) {
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

const repoRoot = findRepoRoot(process.cwd());
if (!repoRoot) {
  console.error(
    "Not inside the mybodyscan repo. cd ~/Documents/GitHub/mybodyscan then re-run."
  );
  process.exit(1);
}

const podCheck = spawnSync("pod", ["--version"], { stdio: "ignore" });
if (podCheck.status !== 0) {
  console.error("CocoaPods not installed. Run: sudo gem install cocoapods");
  process.exit(1);
}

console.log(`[ios-reset] Repo root: ${repoRoot}`);

const iosAppDir = path.join(repoRoot, "ios", "App");
const iosAppBuildDir = path.join(iosAppDir, "App", "build");

console.log("\n[ios-reset] Cleaning iOS artifacts...");
removePath(path.join(iosAppDir, "Pods"));
removePath(path.join(iosAppDir, "Podfile.lock"));
removePath(path.join(iosAppDir, "App.xcworkspace"));
removePath(iosAppBuildDir);

runCommand("Building web bundle", "npm", ["run", "build"], { cwd: repoRoot });
runCommand("Syncing Capacitor iOS", "npx", ["cap", "sync", "ios"], { cwd: repoRoot });
runCommand(
  "Verifying native Firebase Auth plugin is absent",
  "node",
  ["scripts/assert-no-native-firebase-auth.mjs"],
  { cwd: repoRoot }
);
runCommand("Installing CocoaPods", "pod", ["install"], { cwd: iosAppDir });

console.log("\n[ios-reset] ✅ iOS reset complete.");
