import { describe, expect, it } from "vitest";

import { normalizeUrlBase, urlJoin } from "@/lib/config/functionsOrigin";

describe("functionsOrigin helpers", () => {
  it("normalizes URL base without trailing slash", () => {
    expect(
      normalizeUrlBase("https://us-central1-mybodyscan-f3daf.cloudfunctions.net/")
    ).toBe("https://us-central1-mybodyscan-f3daf.cloudfunctions.net");
  });

  it("preserves path when full base URL is provided", () => {
    expect(
      normalizeUrlBase("https://example.com/custom/base/")
    ).toBe("https://example.com/custom/base");
  });

  it("joins path safely", () => {
    expect(urlJoin("https://example.com/base/", "/health")).toBe(
      "https://example.com/base/health"
    );
  });
});
