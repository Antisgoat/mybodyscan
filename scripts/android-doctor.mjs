import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const warnings = [];

const androidDir = path.join(root, "android");
const firebasePath = path.join(androidDir, "app", "google-services.json");
if (!fs.existsSync(androidDir)) failures.push("android/ project is missing.");
if (!fs.existsSync(firebasePath)) {
  failures.push("android/app/google-services.json is missing.");
} else {
  try {
    const config = JSON.parse(fs.readFileSync(firebasePath, "utf8"));
    const clientInfo = config.client?.[0]?.client_info;
    if (config.project_info?.project_id !== "mybodyscan-f3daf") {
      failures.push("Firebase project must be mybodyscan-f3daf.");
    }
    if (
      clientInfo?.android_client_info?.package_name !== "com.mybodyscan.app"
    ) {
      failures.push("Firebase Android package must be com.mybodyscan.app.");
    }
  } catch {
    failures.push("android/app/google-services.json is invalid.");
  }
}

const javaHomes = [
  process.env.JAVA_HOME,
  "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
  "/usr/local/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home",
  "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
  "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home",
].filter(Boolean);
const detectedJavaHome = javaHomes.find((candidate) =>
  fs.existsSync(path.join(candidate, "bin", "java"))
);
const javaCommand = detectedJavaHome
  ? path.join(detectedJavaHome, "bin", "java")
  : "java";
const java = spawnSync(javaCommand, ["-version"], { encoding: "utf8" });
if (java.status !== 0) {
  failures.push("JDK 21+ is unavailable on PATH/JAVA_HOME.");
} else {
  const versionOutput = `${java.stdout ?? ""}\n${java.stderr ?? ""}`;
  const versionMatch = versionOutput.match(/version "(?:1\.)?(\d+)/);
  if (Number(versionMatch?.[1] ?? 0) < 21) {
    failures.push("Capacitor 7 Android builds require JDK 21 or newer.");
  }
}

const localProperties = path.join(androidDir, "local.properties");
let sdkDir = String(process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? "");
if (!sdkDir && fs.existsSync(localProperties)) {
  const match = fs
    .readFileSync(localProperties, "utf8")
    .match(/^sdk\.dir=(.+)$/m);
  sdkDir = match?.[1]?.replace(/\\\\/g, "\\") ?? "";
}
if (!sdkDir) sdkDir = path.join(os.homedir(), "Library", "Android", "sdk");
if (!fs.existsSync(sdkDir)) {
  failures.push(`Android SDK is unavailable at ${sdkDir}.`);
} else {
  for (const requiredPath of [
    path.join(sdkDir, "platforms", "android-36"),
    path.join(sdkDir, "build-tools", "36.0.0"),
    path.join(sdkDir, "platform-tools"),
  ]) {
    if (!fs.existsSync(requiredPath)) {
      failures.push(`Required Android SDK component is missing: ${requiredPath}`);
    }
  }
}

const productionLocal = path.join(root, ".env.production.local");
const envText = fs.existsSync(productionLocal)
  ? fs.readFileSync(productionLocal, "utf8")
  : "";
const androidRevenueCat = envText.match(
  /^VITE_RC_API_KEY_ANDROID\s*=\s*(.+)$/m
)?.[1];
if (!String(androidRevenueCat ?? "").trim()) {
  warnings.push(
    "VITE_RC_API_KEY_ANDROID is not configured yet; debug builds work, but Play release builds must use the public Google Play SDK key."
  );
}

for (const warning of warnings) console.warn(`[android-doctor] WARN: ${warning}`);
if (failures.length) {
  for (const failure of failures) console.error(`[android-doctor] FAIL: ${failure}`);
  process.exit(1);
}

console.log(
  "[android-doctor] PASS: Android project, Firebase identity, JDK, and SDK are available."
);
