import { describe, expect, it } from "vitest";
import {
  selectActiveWeeklyReview,
  type WeeklyReviewDocument,
  type WeeklyReviewStatus,
} from "@/lib/weeklyReview";

function review(id: string, status: WeeklyReviewStatus): WeeklyReviewDocument {
  return {
    id,
    status,
    inputs: {} as WeeklyReviewDocument["inputs"],
    recommendation: {} as WeeklyReviewDocument["recommendation"],
  };
}

describe("selectActiveWeeklyReview", () => {
  it("keeps the most recent accepted review active through a newer pending review", () => {
    expect(
      selectActiveWeeklyReview([
        review("pending", "pending"),
        review("accepted", "accepted"),
      ])?.id
    ).toBe("accepted");
  });

  it("does not reactivate an older review after the latest accepted review is undone", () => {
    expect(
      selectActiveWeeklyReview([
        review("reverted", "reverted"),
        review("older", "accepted"),
      ])
    ).toBeNull();
  });

  it("uses a newer accepted review after a prior undo", () => {
    expect(
      selectActiveWeeklyReview([
        review("new", "accepted"),
        review("reverted", "reverted"),
      ])?.id
    ).toBe("new");
  });
});
