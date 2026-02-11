import { describe, expect, it } from "vitest";

import {
  createNativePolicyBlockedError,
  isAllowedNativeNetworkUrl,
  isPolicyBlockedError,
  NATIVE_ALLOWED_NETWORK_HOSTS,
} from "@/native/securityPolicy";

describe("native security policy", () => {
  it("includes firebase auth hosts", () => {
    expect(NATIVE_ALLOWED_NETWORK_HOSTS).toContain("identitytoolkit.googleapis.com");
    expect(NATIVE_ALLOWED_NETWORK_HOSTS).toContain("securetoken.googleapis.com");
  });

  it("allows firebase auth endpoints", () => {
    expect(
      isAllowedNativeNetworkUrl(
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword"
      )
    ).toBe(true);
    expect(
      isAllowedNativeNetworkUrl(
        "https://securetoken.googleapis.com/v1/token"
      )
    ).toBe(true);
  });

  it("blocks disallowed third-party hosts", () => {
    expect(isAllowedNativeNetworkUrl("https://js.stripe.com/v3")).toBe(false);
    expect(isAllowedNativeNetworkUrl("https://example.com/api")).toBe(false);
  });

  it("creates a policy-blocked error with actionable metadata", () => {
    const err = createNativePolicyBlockedError("https://js.stripe.com/v3");
    expect(err.code).toBe("native/policy-blocked");
    expect(err.blockedBy).toBe("network-allowlist");
    expect(err.message).toMatch(/Blocked by native security policy/);
    expect(isPolicyBlockedError(err)).toBe(true);
  });
});
