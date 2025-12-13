import { describe, expect, it } from "vitest";
import { formatDateTime, toDateOrNull } from "@/lib/time";

describe("time helpers", () => {
  it("formats undefined/null timestamps safely", () => {
    expect(formatDateTime(undefined)).toBe("—");
    expect(formatDateTime(null)).toBe("—");
  });

  it("parses Firestore-like timestamps and dates", () => {
    const d = new Date("2025-01-01T00:00:00.000Z");
    expect(toDateOrNull(d)?.toISOString()).toBe(d.toISOString());
    expect(toDateOrNull({ seconds: 1735689600 })?.getUTCFullYear()).toBe(2025);
    expect(
      toDateOrNull({ toDate: () => d })?.toISOString()
    ).toBe(d.toISOString());
  });
});

