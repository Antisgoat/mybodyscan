import { describe, expect, it } from "vitest";
import {
  sanitizeCoachContent,
  sortCoachThreadMessages,
  type CoachThreadMessage,
} from "./threadStore";

describe("coach thread store", () => {
  it("sanitizes control characters without throwing", () => {
    expect(sanitizeCoachContent(null)).toBe("");
    expect(sanitizeCoachContent("  hi\u0000there \n\n ")).toBe("hi there");
  });

  it("orders messages by createdAt then id", () => {
    const t0 = new Date("2025-01-01T00:00:00.000Z");
    const t1 = new Date("2025-01-01T00:00:01.000Z");
    const messages: CoachThreadMessage[] = [
      { id: "b", role: "assistant", content: "2", createdAt: t1 },
      { id: "c", role: "user", content: "1", createdAt: t0 },
      { id: "a", role: "user", content: "0", createdAt: t0 },
    ];
    const sorted = sortCoachThreadMessages(messages);
    expect(sorted.map((m) => m.id)).toEqual(["a", "c", "b"]);
  });
});

