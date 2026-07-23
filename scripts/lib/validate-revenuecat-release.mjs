export function assertRevenueCatIosReleaseConfig({
  iosKey,
  entitlementId,
}) {
  const revenueCatIosKey = String(iosKey ?? "").trim();
  const revenueCatEntitlement = String(entitlementId ?? "").trim() || "pro";

  if (!revenueCatIosKey) {
    throw new Error(
      "Missing VITE_RC_API_KEY_IOS for the native release build. " +
        "Add the RevenueCat public iOS SDK key to .env.production.local or the release environment."
    );
  }
  if (revenueCatIosKey.startsWith("test_")) {
    throw new Error(
      "Refusing to build an App Store release with a RevenueCat Test Store key. " +
        "Use the public SDK key from the real RevenueCat App Store app configuration."
    );
  }
  if (
    revenueCatIosKey.startsWith("sk_") ||
    revenueCatIosKey.startsWith("atk_")
  ) {
    throw new Error(
      "Refusing to embed a RevenueCat secret or OAuth key in the app. " +
        "VITE_RC_API_KEY_IOS must be the public iOS SDK key."
    );
  }
  if (!revenueCatIosKey.startsWith("appl_")) {
    throw new Error(
      "VITE_RC_API_KEY_IOS must be the public Apple SDK key (prefix appl_) " +
        "from the real RevenueCat App Store app configuration."
    );
  }
  if (revenueCatEntitlement !== "pro") {
    throw new Error(
      "VITE_RC_ENTITLEMENT_ID must be 'pro' to match the production Firebase webhook configuration."
    );
  }
}
