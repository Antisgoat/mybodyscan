import { describe, expect, it } from "vitest";

import { formatTimestamp, toDateOrNull } from "@/lib/time";

describe("time helpers", () => {
  it("formatTimestamp returns fallback for nullish/invalid", () => {
    expect(formatTimestamp(undefined)).toBe("—");
    expect(formatTimestamp(null)).toBe("—");
    expect(formatTimestamp("not-a-date")).toBe("—");
  });

  it("toDateOrNull accepts Date and ISO strings", () => {
    const now = new Date();
    expect(toDateOrNull(now)?.getTime()).toBe(now.getTime());

    const iso = "2025-12-12T12:34:56.000Z";
    expect(toDateOrNull(iso)?.toISOString()).toBe(iso);
  });
});
