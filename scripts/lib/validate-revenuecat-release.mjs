function assertPublicPlatformKey({ value, variableName, prefix, storeName }) {
  const publicKey = String(value ?? "").trim();

  if (!publicKey) {
    throw new Error(
      `Missing ${variableName} for the native release build. ` +
        `Add the RevenueCat public ${storeName} SDK key to .env.production.local or the release environment.`
    );
  }
  if (publicKey.startsWith("test_")) {
    throw new Error(
      `Refusing to build a ${storeName} release with a RevenueCat Test Store key. ` +
        `Use the public SDK key from the real RevenueCat ${storeName} app configuration.`
    );
  }
  if (publicKey.startsWith("sk_") || publicKey.startsWith("atk_")) {
    throw new Error(
      "Refusing to embed a RevenueCat secret or OAuth key in the app. " +
        `${variableName} must be the public ${storeName} SDK key.`
    );
  }
  if (!publicKey.startsWith(prefix)) {
    throw new Error(
      `${variableName} must be the public ${storeName} SDK key (prefix ${prefix}) ` +
        "from the real RevenueCat app-specific configuration."
    );
  }
}

export function assertRevenueCatReleaseConfig({
  platform,
  iosKey,
  androidKey,
  entitlementId,
}) {
  const normalizedPlatform = String(platform ?? "ios")
    .trim()
    .toLowerCase();
  const revenueCatEntitlement = String(entitlementId ?? "").trim() || "pro";

  if (normalizedPlatform === "ios") {
    assertPublicPlatformKey({
      value: iosKey,
      variableName: "VITE_RC_API_KEY_IOS",
      prefix: "appl_",
      storeName: "Apple",
    });
  } else if (normalizedPlatform === "android") {
    assertPublicPlatformKey({
      value: androidKey,
      variableName: "VITE_RC_API_KEY_ANDROID",
      prefix: "goog_",
      storeName: "Google Play",
    });
  } else {
    throw new Error(
      `Unsupported native release platform '${normalizedPlatform}'. Use ios or android.`
    );
  }

  if (revenueCatEntitlement !== "pro") {
    throw new Error(
      "VITE_RC_ENTITLEMENT_ID must be 'pro' to match the production Firebase webhook configuration."
    );
  }
}

export function assertRevenueCatIosReleaseConfig({
  iosKey,
  entitlementId,
}) {
  return assertRevenueCatReleaseConfig({
    platform: "ios",
    iosKey,
    entitlementId,
  });
}
