import { describe, expect, it } from "vitest";
import { formatCoachMessageText } from "./formatMessage";

describe("formatCoachMessageText", () => {
  it("removes lightweight emphasis markers", () => {
    expect(formatCoachMessageText("**Warm-up:** move for 5 minutes."))
      .toBe("Warm-up: move for 5 minutes.");
  });

  it("puts inline numbered exercises on separate lines", () => {
    expect(
      formatCoachMessageText(
        "Complete 2 rounds. 1. Goblet squat 2. Dumbbell row"
      )
    ).toBe("Complete 2 rounds.\n1. Goblet squat\n2. Dumbbell row");
  });

  it("preserves ordinary punctuation and existing line breaks", () => {
    expect(formatCoachMessageText("Rest 60–90 sec.\nStop if pain is sharp."))
      .toBe("Rest 60–90 sec.\nStop if pain is sharp.");
  });
});
