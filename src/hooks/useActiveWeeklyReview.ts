import { useEffect, useState } from "react";
import { useAuthUser } from "@/auth/mbs-auth";
import {
  subscribeActiveWeeklyReview,
  type WeeklyReviewDocument,
} from "@/lib/weeklyReview";

export function useActiveWeeklyReview() {
  const { user } = useAuthUser();
  const [review, setReview] = useState<WeeklyReviewDocument | null>(null);

  useEffect(() => {
    if (!user?.uid) {
      setReview(null);
      return;
    }
    return subscribeActiveWeeklyReview(user.uid, setReview, () =>
      setReview(null)
    );
  }, [user?.uid]);

  const calorieDelta =
    review?.status === "accepted" && Number.isFinite(review.activeCalorieDelta)
      ? Number(review.activeCalorieDelta)
      : 0;

  return { review, calorieDelta };
}
