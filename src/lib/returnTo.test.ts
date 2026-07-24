import { describe, expect, it } from "vitest";
import { sanitizeReturnTo } from "./returnTo";

describe("sanitizeReturnTo", () => {
  it("keeps same-origin app paths, queries, and fragments", () => {
    expect(sanitizeReturnTo("/scan?step=review#photos")).toBe(
      "/scan?step=review#photos"
    );
  });

  it.each([
    "https://example.com",
    "//example.com/path",
    "/\\example.com/path",
    "/%5Cexample.com/path",
    "\\\\example.com/path",
    "javascript:alert(1)",
  ])("rejects external or ambiguous destination %s", (value) => {
    expect(sanitizeReturnTo(value)).toBeNull();
  });
});
