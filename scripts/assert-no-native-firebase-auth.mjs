import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

const repoRoot = process.cwd();
const patterns = [
  "capacitor-firebase/authentication",
  "CapacitorFirebaseAuthentication",
  "FirebaseAuthentication",
];

const targets = [
  "ios/App/Podfile",
  "ios/App/Podfile.lock",
  "ios/App/App.xcodeproj/project.pbxproj",
  "ios/App/App/capacitor.config.json",
  "ios/App/Pods",
];

function pathExists(target) {
  try {
    return fs.existsSync(target);
  } catch {
    return false;
  }
}

function runRipgrep(pattern, target) {
  const result = spawnSync("rg", ["-n", "-S", "-F", pattern, target], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status === 0) {
    return (result.stdout || "").trim();
  }
  if (result.status === 1) {
    return "";
  }
  throw new Error(result.stderr || `rg failed for ${pattern} ${target}`);
}

function scanTargets() {
  const matches = [];
  for (const target of targets) {
    const absTarget = path.join(repoRoot, target);
    if (!pathExists(absTarget)) continue;
    for (const pattern of patterns) {
      const output = runRipgrep(pattern, absTarget);
      if (output) {
        matches.push({ pattern, target, output });
      }
    }
  }
  return matches;
}

let matches = [];
try {
  spawnSync("rg", ["--version"], { stdio: "ignore" });
  matches = scanTargets();
} catch (error) {
  console.error("Failed to run rg for native Firebase Auth guard.");
  console.error(String(error));
  process.exit(1);
}

if (matches.length) {
  console.error("Native Firebase Auth remnants detected. Remove before continuing:");
  for (const match of matches) {
    console.error(`- ${match.pattern} in ${match.target}`);
    if (match.output) {
      console.error(match.output.split("\n").slice(0, 10).join("\n"));
    }
  }
  process.exit(1);
}
