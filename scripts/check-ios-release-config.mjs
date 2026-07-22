import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const failures = [];
const requireText = (contents, needle, message) => {
  if (!contents.includes(needle)) failures.push(message);
};

const project = read("ios/App/App.xcodeproj/project.pbxproj");
const info = read("ios/App/App/Info.plist");
const privacy = read("ios/App/App/PrivacyInfo.xcprivacy");
const archive = read("ios/scripts/ios_archive.sh");
const envExample = read(".env.production.example");
const podLock = read("ios/App/Podfile.lock");
const packageJson = JSON.parse(read("package.json"));
const entitlements = read("ios/App/App/App.entitlements");
const iapClient = read("src/lib/billing/iapProducts.ts");
const iapServer = read("functions/src/revenuecat/plans.ts");
const firebaseJson = JSON.parse(read("firebase.json"));

const expectedNativePackages = {
  "@capacitor/core": "7.6.8",
  "@capacitor/ios": "7.6.8",
  "@capacitor/app": "7.1.2",
  "@capacitor/browser": "7.0.5",
  "@capacitor-firebase/messaging": "7.5.0",
  "@revenuecat/purchases-capacitor": "11.2.6",
};
for (const [name, expectedVersion] of Object.entries(expectedNativePackages)) {
  if (packageJson.dependencies?.[name] !== expectedVersion) {
    failures.push(`${name} must be pinned to ${expectedVersion}.`);
  }
}
if (packageJson.devDependencies?.["@capacitor/cli"] !== "7.6.8") {
  failures.push("@capacitor/cli must be pinned to 7.6.8.");
}
requireText(
  podLock,
  "RevenueCat (5.43.0)",
  "Podfile.lock must use RevenueCat iOS 5.43.0 or later for Test Store support."
);
requireText(
  podLock,
  "PurchasesHybridCommon (17.10.0)",
  "Podfile.lock must match RevenueCat Capacitor 11.2.6."
);

const teamMatches = project.match(/DEVELOPMENT_TEAM = LSSBW4456K;/g) ?? [];
if (teamMatches.length !== 2) {
  failures.push(
    "Xcode Debug and Release configurations must both use the ADLR Labs team."
  );
}
requireText(
  project,
  "PRODUCT_BUNDLE_IDENTIFIER = com.mybodyscan.app;",
  "Xcode must use bundle ID com.mybodyscan.app."
);
requireText(
  project,
  "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;",
  "Xcode must sign with the committed push notification entitlements."
);
requireText(
  project,
  "APS_ENVIRONMENT = production;",
  "The Release configuration must use the production APNs environment."
);
requireText(
  entitlements,
  "<key>aps-environment</key>",
  "The iOS entitlements must include APNs delivery."
);
if (info.includes("NSAllowsArbitraryLoads")) {
  failures.push("Info.plist must not allow arbitrary network loads.");
}
requireText(
  info,
  "<string>MyBodyScan</string>",
  "Info.plist must use the MyBodyScan display name."
);
requireText(
  info,
  "<key>FirebaseMessagingAutoInitEnabled</key>\n\t<false/>",
  "Firebase Messaging auto-init must stay disabled until the user opts in."
);
requireText(
  archive,
  "npm run build:native:release",
  "The archive command must build a fresh guarded native release bundle."
);
const appDelegate = read("ios/App/App/AppDelegate.swift");
requireText(
  appDelegate,
  ".capacitorDidRegisterForRemoteNotifications",
  "AppDelegate must forward APNs registration to Capacitor Messaging."
);
requireText(
  appDelegate,
  'Notification.Name("didReceiveRemoteNotification")',
  "AppDelegate must forward remote notification delivery."
);
requireText(
  privacy,
  "<key>NSPrivacyTracking</key>\n\t<false/>",
  "Privacy manifest must explicitly declare that the app does not track."
);

const requiredPrivacyTypes = [
  "NSPrivacyCollectedDataTypeEmailAddress",
  "NSPrivacyCollectedDataTypeUserID",
  "NSPrivacyCollectedDataTypeDeviceID",
  "NSPrivacyCollectedDataTypeHealth",
  "NSPrivacyCollectedDataTypeFitness",
  "NSPrivacyCollectedDataTypePhotosorVideos",
  "NSPrivacyCollectedDataTypeOtherUserContent",
  "NSPrivacyCollectedDataTypeSearchHistory",
  "NSPrivacyCollectedDataTypePurchaseHistory",
  "NSPrivacyCollectedDataTypeProductInteraction",
  "NSPrivacyCollectedDataTypeCrashData",
  "NSPrivacyCollectedDataTypeOtherDiagnosticData",
];
for (const dataType of requiredPrivacyTypes) {
  requireText(
    privacy,
    `<string>${dataType}</string>`,
    `Privacy manifest is missing ${dataType}.`
  );
}

requireText(
  archive,
  "npx cap sync ios",
  "The archive command must synchronize the fresh bundle into iOS."
);
requireText(
  envExample,
  "VITE_RC_API_KEY_IOS=",
  "The production env template must document the RevenueCat iOS public key."
);
requireText(
  envExample,
  "VITE_RC_ENTITLEMENT_ID=pro",
  "The production env template must pin the RevenueCat entitlement to pro."
);

const revenueCatProductIds = {
  REVENUECAT_MONTHLY_PRODUCT_ID: "com.mybodyscan.pro.monthly",
  REVENUECAT_YEARLY_PRODUCT_ID: "com.mybodyscan.pro.yearly",
  REVENUECAT_ONE_SCAN_PRODUCT_ID: "com.mybodyscan.scan.single",
};
const functionEnv = firebaseJson.functions?.[0]?.environmentVariables ?? {};
for (const [envName, productId] of Object.entries(revenueCatProductIds)) {
  if (functionEnv[envName] !== productId) {
    failures.push(`firebase.json must set ${envName}=${productId}.`);
  }
  requireText(
    iapClient,
    `"${productId}"`,
    `The iOS paywall allowlist must contain ${productId}.`
  );
  requireText(
    iapServer,
    `"${productId}"`,
    `The RevenueCat webhook allowlist must contain ${productId}.`
  );
}

if (failures.length) {
  console.error("iOS release configuration check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("iOS release configuration check passed.");
