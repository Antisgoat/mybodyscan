import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const iosPlistPath = path.join(root, "ios", "App", "App", "GoogleService-Info.plist");
const fixturePlistPath = path.join(root, "tests", "fixtures", "GoogleService-Info.plist");
const nativePolicyPath = path.join(root, "config", "native-security-policy.json");

const requiredHosts = [
  "identitytoolkit.googleapis.com",
  "securetoken.googleapis.com",
];

function fail(message) {
  console.error(`❌ [smoke:ios] ${message}`);
  process.exit(1);
}

function pass(message) {
  console.log(`✅ [smoke:ios] ${message}`);
}

function runStep(command, args, env = {}) {
  const printable = [command, ...args].join(" ");
  console.log(`▶ [smoke:ios] ${printable}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    fail(`Command failed: ${printable}`);
  }
}

function readSha(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verifyIosPlist() {
  if (!fs.existsSync(iosPlistPath)) {
    fail(`Missing iOS plist: ${path.relative(root, iosPlistPath)}`);
  }
  if (fs.existsSync(fixturePlistPath) && readSha(iosPlistPath) === readSha(fixturePlistPath)) {
    fail("iOS plist matches test fixture; install the real Firebase plist before release builds.");
  }
  pass("GoogleService-Info.plist exists and is not the fixture.");
}

function verifyNativeAllowlist() {
  if (!fs.existsSync(nativePolicyPath)) {
    fail(`Missing native policy file: ${path.relative(root, nativePolicyPath)}`);
  }
  const policy = JSON.parse(fs.readFileSync(nativePolicyPath, "utf8"));
  const hosts = Array.isArray(policy.nativeAllowedNetworkHosts)
    ? policy.nativeAllowedNetworkHosts
    : [];
  for (const host of requiredHosts) {
    if (!hosts.includes(host)) {
      fail(`native allowlist missing required host: ${host}`);
    }
  }
  pass("native allowlist includes Firebase Auth hosts (identitytoolkit + securetoken).");
}

runStep("npm", ["run", "build:web"]);
runStep("npm", ["run", "build:native:ios"]);
runStep("npx", ["cap", "sync", "ios"]);
verifyIosPlist();
verifyNativeAllowlist();
pass("iOS smoke checks passed.");
