import { assertRevenueCatReleaseConfig } from "./lib/validate-revenuecat-release.mjs";

const rejectionCases = [
  {
    name: "missing Apple key",
    config: { platform: "ios", iosKey: "", entitlementId: "pro" },
    expected: /Missing VITE_RC_API_KEY_IOS/,
  },
  {
    name: "Apple Test Store key",
    config: {
      platform: "ios",
      iosKey: "test_ci_only",
      entitlementId: "pro",
    },
    expected: /Test Store key/,
  },
  {
    name: "Apple secret key",
    config: { platform: "ios", iosKey: "sk_ci_only", entitlementId: "pro" },
    expected: /secret or OAuth key/,
  },
  {
    name: "non-Apple public key",
    config: {
      platform: "ios",
      iosKey: "goog_ci_only",
      entitlementId: "pro",
    },
    expected: /prefix appl_/,
  },
  {
    name: "wrong entitlement",
    config: {
      platform: "android",
      androidKey: "goog_ci_only",
      entitlementId: "premium",
    },
    expected: /must be 'pro'/,
  },
  {
    name: "missing Google Play key",
    config: { platform: "android", androidKey: "", entitlementId: "pro" },
    expected: /Missing VITE_RC_API_KEY_ANDROID/,
  },
  {
    name: "Google Play Test Store key",
    config: {
      platform: "android",
      androidKey: "test_ci_only",
      entitlementId: "pro",
    },
    expected: /Test Store key/,
  },
  {
    name: "non-Google public key",
    config: {
      platform: "android",
      androidKey: "appl_ci_only",
      entitlementId: "pro",
    },
    expected: /prefix goog_/,
  },
];

for (const testCase of rejectionCases) {
  let rejected = false;
  try {
    assertRevenueCatReleaseConfig(testCase.config);
  } catch (error) {
    rejected = testCase.expected.test(String(error));
  }
  if (!rejected) {
    throw new Error(`Release guard did not reject ${testCase.name}.`);
  }
}

assertRevenueCatReleaseConfig({
  platform: "ios",
  iosKey: "appl_ci_public_key",
  entitlementId: "pro",
});
assertRevenueCatReleaseConfig({
  platform: "android",
  androidKey: "goog_ci_public_key",
  entitlementId: "pro",
});

console.log("Native iOS and Android RevenueCat release guard checks passed.");
