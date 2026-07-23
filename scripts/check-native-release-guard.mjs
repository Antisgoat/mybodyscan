import { assertRevenueCatIosReleaseConfig } from "./lib/validate-revenuecat-release.mjs";

const rejectionCases = [
  {
    name: "missing key",
    config: { iosKey: "", entitlementId: "pro" },
    expected: /Missing VITE_RC_API_KEY_IOS/,
  },
  {
    name: "Test Store key",
    config: { iosKey: "test_ci_only", entitlementId: "pro" },
    expected: /Test Store key/,
  },
  {
    name: "secret key",
    config: { iosKey: "sk_ci_only", entitlementId: "pro" },
    expected: /secret or OAuth key/,
  },
  {
    name: "non-Apple public key",
    config: { iosKey: "goog_ci_only", entitlementId: "pro" },
    expected: /prefix appl_/,
  },
  {
    name: "wrong entitlement",
    config: { iosKey: "appl_ci_only", entitlementId: "premium" },
    expected: /must be 'pro'/,
  },
];

for (const testCase of rejectionCases) {
  let rejected = false;
  try {
    assertRevenueCatIosReleaseConfig(testCase.config);
  } catch (error) {
    rejected = testCase.expected.test(String(error));
  }
  if (!rejected) {
    throw new Error(`Release guard did not reject ${testCase.name}.`);
  }
}

assertRevenueCatIosReleaseConfig({
  iosKey: "appl_ci_public_key",
  entitlementId: "pro",
});

console.log("Native release RevenueCat guard check passed.");
