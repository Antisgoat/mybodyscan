import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const failures = [];

const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const requireText = (contents, pattern, message) => {
  if (!pattern.test(contents)) failures.push(message);
};

const requiredFiles = [
  "android/app/build.gradle",
  "android/build.gradle",
  "android/variables.gradle",
  "android/gradle/wrapper/gradle-wrapper.properties",
  "android/app/src/main/AndroidManifest.xml",
  "android/app/src/main/res/xml/data_extraction_rules.xml",
  "android/app/src/main/res/xml/full_backup_rules.xml",
  "android/app/src/main/res/xml/network_security_config.xml",
  "android/app/src/test/java/com/mybodyscan/app/ExampleUnitTest.java",
  "android/app/src/androidTest/java/com/mybodyscan/app/ExampleInstrumentedTest.java",
  "android/keystore.properties.example",
];
for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`Missing ${relativePath}.`);
  }
}

if (!failures.length) {
  const appGradle = read("android/app/build.gradle");
  const rootGradle = read("android/build.gradle");
  const variables = read("android/variables.gradle");
  const wrapper = read("android/gradle/wrapper/gradle-wrapper.properties");
  const manifest = read("android/app/src/main/AndroidManifest.xml");
  const networkSecurity = read(
    "android/app/src/main/res/xml/network_security_config.xml"
  );
  const packageJson = JSON.parse(read("package.json"));
  const productionExample = read(".env.production.example");
  const nativeAppCheck = read("src/lib/appCheck.native.ts");
  const instrumentedTest = read(
    "android/app/src/androidTest/java/com/mybodyscan/app/ExampleInstrumentedTest.java"
  );

  requireText(
    appGradle,
    /applicationId\s+["']com\.mybodyscan\.app["']/,
    "Android applicationId must be com.mybodyscan.app."
  );
  requireText(
    appGradle,
    /namespace\s+["']com\.mybodyscan\.app["']/,
    "Android namespace must be com.mybodyscan.app."
  );
  requireText(
    variables,
    /compileSdkVersion\s*=\s*36\b/,
    "Android compileSdkVersion must be 36."
  );
  requireText(
    variables,
    /targetSdkVersion\s*=\s*36\b/,
    "Android targetSdkVersion must be 36."
  );
  requireText(
    rootGradle,
    /com\.android\.tools\.build:gradle:8\.10\./,
    "Android Gradle Plugin must use the API-36-compatible 8.10 line."
  );
  requireText(
    wrapper,
    /gradle-8\.11\.1-/,
    "Gradle wrapper must use 8.11.1 for AGP 8.10."
  );
  requireText(
    manifest,
    /android:allowBackup=["']false["']/,
    "Android backups must remain disabled for private health/photo data."
  );
  requireText(
    manifest,
    /android:usesCleartextTraffic=["']false["']/,
    "Android cleartext traffic must remain disabled."
  );
  requireText(
    manifest,
    /android\.permission\.CAMERA/,
    "Android manifest must request camera permission for scan/barcode capture."
  );
  requireText(
    manifest,
    /android:name=["']android\.hardware\.camera["'][\s\S]*android:required=["']false["']/,
    "Android camera hardware must be optional so photo uploads remain available on non-camera devices."
  );
  requireText(
    manifest,
    /android:dataExtractionRules=["']@xml\/data_extraction_rules["']/,
    "Android 12+ backup and device-transfer exclusions must remain configured."
  );
  requireText(
    manifest,
    /android:fullBackupContent=["']@xml\/full_backup_rules["']/,
    "Pre-Android 12 backup exclusions must remain configured."
  );
  requireText(
    manifest,
    /android\.permission\.POST_NOTIFICATIONS/,
    "Android manifest must declare Android 13+ notification permission."
  );
  requireText(
    networkSecurity,
    /cleartextTrafficPermitted=["']false["']/,
    "Android network security config must reject cleartext traffic."
  );
  if (/READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/.test(manifest)) {
    failures.push(
      "Android must use the system photo picker and must not request broad storage access."
    );
  }

  const androidVersion =
    packageJson.dependencies?.["@capacitor/android"] ?? "";
  const coreVersion = packageJson.dependencies?.["@capacitor/core"] ?? "";
  if (!androidVersion || androidVersion !== coreVersion) {
    failures.push(
      "@capacitor/android must be present at the exact @capacitor/core version."
    );
  }
  if (
    packageJson.dependencies?.["@capacitor-firebase/app-check"] !== "7.5.0"
  ) {
    failures.push(
      "@capacitor-firebase/app-check must be pinned to 7.5.0 for native Play Integrity."
    );
  }
  requireText(
    nativeAppCheck,
    /registerPlugin<[\s\S]*>\(["']FirebaseAppCheck["']\)/,
    "Android App Check must use the native FirebaseAppCheck bridge."
  );
  requireText(
    nativeAppCheck,
    /isTokenAutoRefreshEnabled:\s*true/,
    "Android App Check must auto-refresh Play Integrity tokens."
  );
  requireText(
    nativeAppCheck,
    /new CustomProvider[\s\S]*getToken:\s*getNativeToken/,
    "Android App Check must feed Play Integrity tokens to Firebase JS clients."
  );
  if (/debugToken:\s*true/.test(nativeAppCheck)) {
    failures.push(
      "Android release-capable source must not enable the App Check debug provider."
    );
  }
  requireText(
    instrumentedTest,
    /assertEquals\(["']com\.mybodyscan\.app["'],\s*appContext\.getPackageName\(\)\)/,
    "Android instrumentation smoke test must assert the production package identity."
  );
  requireText(
    productionExample,
    /^VITE_RC_API_KEY_ANDROID=/m,
    ".env.production.example must document VITE_RC_API_KEY_ANDROID."
  );
}

const firebaseConfigPath = path.join(
  root,
  "android",
  "app",
  "google-services.json"
);
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf8"));
    const client = Array.isArray(config.client) ? config.client[0] : null;
    const clientInfo = client?.client_info;
    if (config.project_info?.project_id !== "mybodyscan-f3daf") {
      failures.push(
        "android/app/google-services.json must belong to mybodyscan-f3daf."
      );
    }
    if (
      clientInfo?.android_client_info?.package_name !== "com.mybodyscan.app"
    ) {
      failures.push(
        "android/app/google-services.json package must be com.mybodyscan.app."
      );
    }
    if (!String(clientInfo?.mobilesdk_app_id ?? "").includes(":android:")) {
      failures.push(
        "android/app/google-services.json must contain an Android Firebase app ID."
      );
    }
  } catch {
    failures.push("android/app/google-services.json is not valid JSON.");
  }
}

try {
  const tracked = execFileSync("git", ["ls-files"], {
    cwd: root,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  const forbiddenTracked = tracked.filter(
    (file) =>
      file === "android/app/google-services.json" ||
      file === "android/keystore.properties" ||
      /\.(?:jks|keystore)$/.test(file)
  );
  if (forbiddenTracked.length) {
    failures.push(
      `Android credentials must not be tracked: ${forbiddenTracked.join(", ")}.`
    );
  }
} catch {
  failures.push("Unable to verify tracked Android credential files.");
}

if (failures.length) {
  for (const failure of failures) console.error(`[android-release] ${failure}`);
  process.exit(1);
}

console.log(
  "[android-release] PASS: package, API 36 toolchain, permissions, network policy, Firebase identity, and credential guards are consistent."
);
