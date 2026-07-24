import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const failures = [];
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const packageJson = JSON.parse(read("package.json"));
if (
  packageJson.dependencies?.["@capacitor-firebase/authentication"] !== "7.5.0"
) {
  failures.push(
    "@capacitor-firebase/authentication must remain pinned to Capacitor-compatible 7.5.0."
  );
}
if (packageJson.dependencies?.["@capacitor-firebase/app-check"] !== "7.5.0") {
  failures.push(
    "@capacitor-firebase/app-check must remain pinned to Capacitor-compatible 7.5.0."
  );
}

const config = read("capacitor.config.ts");
if (
  !/FirebaseAuthentication[\s\S]*providers:\s*\[[^\]]*"google\.com"[^\]]*"apple\.com"/.test(
    config
  )
) {
  failures.push(
    "Capacitor Firebase Authentication must load both Google and Apple providers."
  );
}
if (!/FirebaseAuthentication[\s\S]*skipNativeAuth:\s*true/.test(config)) {
  failures.push(
    "Native OAuth must return provider credentials without creating a separate native-only session."
  );
}

const nativeImpl = read("src/auth/mbs-auth.native.ts");
if (!/registerPlugin<[\s\S]*>\(\s*"FirebaseAuthentication"/.test(nativeImpl)) {
  failures.push(
    "Native auth must register the FirebaseAuthentication bridge directly."
  );
}

const nativeAppCheck = read("src/lib/appCheck.native.ts");
if (
  !/registerPlugin<[\s\S]*>\(\s*"FirebaseAppCheck"/.test(nativeAppCheck)
) {
  failures.push("Native App Check must register its Capacitor bridge directly.");
}
if (
  /(?:from|import\()\s*["']@capacitor-firebase\/app-check/.test(
    nativeAppCheck
  )
) {
  failures.push(
    "Native App Check must not import the plugin JavaScript entrypoint; it would bundle the web fallback."
  );
}
if (!/(?:from|import\()\s*["']firebase\/app-check/.test(nativeAppCheck)) {
  failures.push(
    "Native App Check must adapt native tokens into the Firebase JS clients."
  );
}
if (
  !/new CustomProvider/.test(nativeAppCheck) ||
  !/getToken:\s*getNativeToken/.test(nativeAppCheck)
) {
  failures.push(
    "Native App Check must use CustomProvider so Firestore, Storage, and callable requests receive native attestation."
  );
}
if (
  !/isTokenAutoRefreshEnabled:\s*true/.test(nativeAppCheck) ||
  /debugToken:\s*true/.test(nativeAppCheck)
) {
  failures.push(
    "Native App Check must auto-refresh real attestation tokens and must not enable the debug provider."
  );
}
if (
  /(?:from|import\()\s*["']@capacitor-firebase\/authentication/.test(
    nativeImpl
  )
) {
  failures.push(
    "Native auth must not import the plugin JavaScript entrypoint; it would bundle the web fallback."
  );
}
if (!/(?:from|import\()\s*["']firebase\/auth/.test(nativeImpl)) {
  failures.push(
    "Native auth must synchronize native OAuth credentials into modular Firebase JS Auth."
  );
}
for (const [pattern, message] of [
  [
    /initializeAuth\([\s\S]*indexedDBLocalPersistence/,
    "Native Firebase JS Auth must use IndexedDB persistence.",
  ],
  [
    /signInWithGoogle\([\s\S]*skipNativeAuth:\s*true[\s\S]*GoogleAuthProvider\.credential[\s\S]*signInWithCredential/,
    "Native Google sign-in must synchronize its credential into Firebase JS Auth.",
  ],
  [
    /signInWithApple\([\s\S]*skipNativeAuth:\s*true[\s\S]*OAuthProvider\(["']apple\.com["']\)[\s\S]*rawNonce[\s\S]*signInWithCredential/,
    "Native Apple sign-in must synchronize the ID token and nonce into Firebase JS Auth.",
  ],
]) {
  if (!pattern.test(nativeImpl)) failures.push(message);
}
if (
  /signInWithPopup|signInWithRedirect|RecaptchaVerifier|browserPopupRedirectResolver/.test(
    nativeImpl
  )
) {
  failures.push(
    "Native auth must not use browser OAuth, redirects, popups, or reCAPTCHA."
  );
}

const podfile = read("ios/App/Podfile");
if (!/CapacitorFirebaseAuthentication\/Google/.test(podfile)) {
  failures.push("The iOS Google authentication pod is missing.");
}

const appDelegate = read("ios/App/App/AppDelegate.swift");
if (
  !/import FirebaseAuth/.test(appDelegate) ||
  !/Auth\.auth\(\)\.canHandle\(url\)/.test(appDelegate)
) {
  failures.push(
    "The iOS app delegate must let Firebase Auth handle authentication callback URLs."
  );
}

const entitlements = read("ios/App/App/App.entitlements");
if (!/com\.apple\.developer\.applesignin/.test(entitlements)) {
  failures.push("The iOS Sign in with Apple entitlement is missing.");
}

const capList = spawnSync("npx", ["cap", "ls", "ios"], {
  cwd: root,
  encoding: "utf8",
});
if (capList.status !== 0) {
  failures.push(
    `Unable to inspect iOS Capacitor plugins: ${(
      capList.stderr ||
      capList.stdout ||
      "unknown error"
    ).trim()}`
  );
} else if (
  !`${capList.stdout}\n${capList.stderr}`.includes(
    "@capacitor-firebase/authentication"
  )
) {
  failures.push(
    "The native Firebase Authentication plugin is not synced into iOS."
  );
}
if (
  capList.status === 0 &&
  !`${capList.stdout}\n${capList.stderr}`.includes(
    "@capacitor-firebase/app-check"
  )
) {
  failures.push("The native Firebase App Check plugin is not synced into iOS.");
}

if (failures.length) {
  for (const failure of failures) {
    console.error(`[native-auth] FAIL: ${failure}`);
  }
  process.exit(1);
}

console.log(
  "[native-auth] PASS: native OAuth/App Check bridges, Firebase JS session and attestation adapters, Google/Apple providers, iOS callback handling, and web-fallback boundaries are configured."
);
