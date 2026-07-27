import { callRequestFunction } from "@/lib/backend/callBackend";
import { db } from "@/lib/firebase";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";

export type WeeklyReviewStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "reverted";
export type WeeklyReviewTrend = "on_track" | "stalled" | "too_fast";
export type WeeklyReviewGoal =
  | "lose_fat"
  | "gain_muscle"
  | "maintain"
  | "recomp";

export interface WeeklyReviewInputs {
  hunger: number;
  energy: number;
  sleep: number;
  soreness: number;
  stress: number;
  adherence: number;
  trend: WeeklyReviewTrend;
  goal: WeeklyReviewGoal;
  notes: string;
  localDate: string;
  dayId: string;
}

export interface WeeklyReviewRecommendation {
  calorieDelta: number;
  intensityDelta: number;
  volumeDelta: number;
  headline: string;
  reasons: string[];
  caution?: string | null;
}

export interface WeeklyReviewDocument {
  id: string;
  status: WeeklyReviewStatus;
  inputs: WeeklyReviewInputs;
  recommendation: WeeklyReviewRecommendation;
  activeCalorieDelta?: number;
  submittedAt?: unknown;
  resolvedAt?: unknown;
  revertedAt?: unknown;
}

export function selectActiveWeeklyReview(
  reviews: WeeklyReviewDocument[]
): WeeklyReviewDocument | null {
  const latestResolved = reviews.find(
    (review) => review.status === "accepted" || review.status === "reverted"
  );
  return latestResolved?.status === "accepted" ? latestResolved : null;
}

export async function requestWeeklyRecommendation(
  inputs: WeeklyReviewInputs
): Promise<WeeklyReviewDocument> {
  const response = await callRequestFunction<{
    review?: WeeklyReviewDocument;
  }>("weeklyReview", { action: "recommend", inputs }, { method: "POST" });
  if (!response.review?.id || !response.review.recommendation) {
    throw new Error("weekly_review_invalid_response");
  }
  return response.review;
}

export async function resolveWeeklyReview(
  reviewId: string,
  action: "accept" | "decline" | "undo"
) {
  return callRequestFunction<{
    ok?: boolean;
    status?: WeeklyReviewStatus;
    activeCalorieDelta?: number;
  }>(
    "weeklyReview",
    { action, reviewId },
    {
      method: "POST",
    }
  );
}

export function subscribeLatestWeeklyReview(
  uid: string,
  callback: (review: WeeklyReviewDocument | null) => void,
  onError?: (error: Error) => void
) {
  const reviewQuery = query(
    collection(db, "users", uid, "weeklyReviews"),
    orderBy("submittedAt", "desc"),
    limit(1)
  );
  return onSnapshot(
    reviewQuery,
    (snapshot) => {
      const first = snapshot.docs[0];
      callback(
        first
          ? ({
              id: first.id,
              ...first.data(),
            } as WeeklyReviewDocument)
          : null
      );
    },
    (error) => {
      callback(null);
      onError?.(error);
    }
  );
}

export function subscribeActiveWeeklyReview(
  uid: string,
  callback: (review: WeeklyReviewDocument | null) => void,
  onError?: (error: Error) => void
) {
  const reviewQuery = query(
    collection(db, "users", uid, "weeklyReviews"),
    orderBy("submittedAt", "desc"),
    limit(12)
  );
  return onSnapshot(
    reviewQuery,
    (snapshot) => {
      callback(
        selectActiveWeeklyReview(
          snapshot.docs.map(
            (candidate) =>
              ({
                id: candidate.id,
                ...candidate.data(),
              }) as WeeklyReviewDocument
          )
        )
      );
    },
    (error) => {
      callback(null);
      onError?.(error);
    }
  );
}
