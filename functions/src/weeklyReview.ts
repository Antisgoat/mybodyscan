import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "./firebase.js";
import { requireAuth } from "./http.js";
import { ensureSoftAppCheckFromRequest } from "./lib/appCheckSoft.js";
import { errorCode, statusFromCode } from "./lib/errors.js";
import { requireProEntitlement } from "./lib/proEntitlements.js";
import { scrubUndefined } from "./lib/scrub.js";
import { enforceRateLimit } from "./middleware/rateLimit.js";
import { withCors } from "./middleware/cors.js";
import { persistDailyWorkoutAdjustment } from "./workouts.js";

const db = getFirestore();
const REVIEW_VERSION = 1;
const MAX_NOTES_LENGTH = 500;
const VALID_TRENDS = new Set(["on_track", "stalled", "too_fast"]);
const VALID_GOALS = new Set(["lose_fat", "gain_muscle", "maintain", "recomp"]);

type ReviewTrend = "on_track" | "stalled" | "too_fast";
type ReviewGoal = "lose_fat" | "gain_muscle" | "maintain" | "recomp";
type ReviewStatus = "pending" | "accepted" | "declined" | "reverted";

type ReviewInputs = {
  hunger: number;
  energy: number;
  sleep: number;
  soreness: number;
  stress: number;
  adherence: number;
  trend: ReviewTrend;
  goal: ReviewGoal;
  notes: string | null;
  localDate: string;
  dayId: string;
};

type ReviewRecommendation = {
  calorieDelta: number;
  intensityDelta: number;
  volumeDelta: number;
  headline: string;
  reasons: string[];
  caution: string | null;
};

function clampInteger(
  value: unknown,
  min: number,
  max: number,
  field: string
): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  const rounded = Math.round(number);
  if (rounded < min || rounded > max) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must be between ${min} and ${max}.`
    );
  }
  return rounded;
}

function normalizeDate(value: unknown): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const parsed = new Date(`${value}T12:00:00.000Z`);
    if (!Number.isNaN(parsed.getTime())) return value;
  }
  return new Date().toISOString().slice(0, 10);
}

function normalizeInputs(raw: unknown): ReviewInputs {
  const body =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const trend =
    typeof body.trend === "string" && VALID_TRENDS.has(body.trend)
      ? (body.trend as ReviewTrend)
      : null;
  const goal =
    typeof body.goal === "string" && VALID_GOALS.has(body.goal)
      ? (body.goal as ReviewGoal)
      : null;
  const dayId =
    typeof body.dayId === "string" && body.dayId.trim().length
      ? body.dayId.trim().slice(0, 16)
      : "";
  if (!trend || !goal || !dayId) {
    throw new HttpsError(
      "invalid-argument",
      "Trend, goal, and current training day are required."
    );
  }
  const notes =
    typeof body.notes === "string" && body.notes.trim().length
      ? body.notes.trim().slice(0, MAX_NOTES_LENGTH)
      : null;
  return {
    hunger: clampInteger(body.hunger, 1, 5, "Hunger"),
    energy: clampInteger(body.energy, 1, 5, "Energy"),
    sleep: clampInteger(body.sleep, 1, 5, "Sleep"),
    soreness: clampInteger(body.soreness, 1, 5, "Soreness"),
    stress: clampInteger(body.stress, 1, 5, "Stress"),
    adherence: clampInteger(body.adherence, 0, 100, "Adherence"),
    trend,
    goal,
    notes,
    localDate: normalizeDate(body.localDate),
    dayId,
  };
}

export function buildWeeklyRecommendation(
  input: ReviewInputs
): ReviewRecommendation {
  const reasons: string[] = [];
  let calorieDelta = 0;
  let intensityDelta = 0;
  let volumeDelta = 0;
  let caution: string | null = null;

  const recoveryStrained =
    input.sleep <= 2 ||
    input.energy <= 2 ||
    input.soreness >= 4 ||
    input.stress >= 4;

  if (recoveryStrained) {
    intensityDelta = -1;
    volumeDelta = -1;
    reasons.push(
      "Recovery signals are strained, so the next workout should be a little easier."
    );
  } else if (
    input.energy >= 4 &&
    input.sleep >= 4 &&
    input.soreness <= 2 &&
    input.adherence >= 85
  ) {
    intensityDelta = 1;
    reasons.push(
      "Recovery and consistency look strong enough for a small, optional progression."
    );
  } else {
    reasons.push(
      "Recovery signals support keeping training stress steady this week."
    );
  }

  if (input.adherence < 70) {
    reasons.push(
      "Consistency is below 70%, so no calorie change is recommended yet."
    );
  } else if (input.trend === "too_fast") {
    calorieDelta =
      input.goal === "lose_fat" ? 100 : input.goal === "gain_muscle" ? -100 : 0;
    reasons.push(
      calorieDelta === 0
        ? "The trend is faster than planned; hold intake steady and review the next full week."
        : "A small calorie adjustment can slow the trend without a drastic change."
    );
  } else if (input.trend === "stalled" && input.adherence >= 85) {
    calorieDelta =
      input.goal === "lose_fat" ? -100 : input.goal === "gain_muscle" ? 100 : 0;
    reasons.push(
      calorieDelta === 0
        ? "The current goal does not call for an automatic calorie change."
        : "High consistency plus a stalled trend supports only a small calorie adjustment."
    );
  } else {
    reasons.push(
      "The current trend does not justify changing the calorie target."
    );
  }

  if (input.hunger >= 5 && calorieDelta < 0) {
    calorieDelta = 0;
    reasons.push(
      "Very high hunger overrides a calorie reduction; focus on meal quality and consistency first."
    );
  }

  if (input.soreness >= 5) {
    caution =
      "Do not train through sharp or worsening pain. Stop the affected movement and seek qualified medical guidance when appropriate.";
  }

  const headline =
    calorieDelta === 0 && intensityDelta === 0 && volumeDelta === 0
      ? "Keep the plan steady"
      : recoveryStrained
        ? "Prioritize recovery this week"
        : "Make one small, measured adjustment";

  return {
    calorieDelta,
    intensityDelta,
    volumeDelta,
    headline,
    reasons,
    caution,
  };
}

function reviewRef(uid: string, reviewId: string) {
  return db.doc(`users/${uid}/weeklyReviews/${reviewId}`);
}

async function requireSubscriber(req: Request): Promise<string> {
  const uid = await requireAuth(req);
  await requireProEntitlement(uid);
  await ensureSoftAppCheckFromRequest(req, {
    fn: "weeklyReview",
    uid,
  });
  return uid;
}

async function recommend(uid: string, req: Request, res: Response) {
  const inputs = normalizeInputs(req.body?.inputs);
  const recommendation = buildWeeklyRecommendation(inputs);
  const reviewId = randomUUID();
  const now = Timestamp.now();
  await reviewRef(uid, reviewId).set(
    scrubUndefined({
      id: reviewId,
      version: REVIEW_VERSION,
      status: "pending" satisfies ReviewStatus,
      inputs,
      recommendation,
      submittedAt: now,
      updatedAt: now,
    })
  );
  res.status(200).json({
    review: {
      id: reviewId,
      status: "pending",
      inputs,
      recommendation,
    },
  });
}

async function resolveReview(
  uid: string,
  req: Request,
  res: Response,
  action: "accept" | "decline" | "undo"
) {
  const reviewId =
    typeof req.body?.reviewId === "string"
      ? req.body.reviewId.trim().slice(0, 80)
      : "";
  if (!reviewId) {
    throw new HttpsError("invalid-argument", "reviewId is required.");
  }
  const ref = reviewRef(uid, reviewId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Weekly review not found.");
  }
  const review = snap.data() as {
    status?: ReviewStatus;
    inputs?: ReviewInputs;
    recommendation?: ReviewRecommendation;
    appliedAdjustment?: { planId?: string; date?: string };
  };
  const now = Timestamp.now();

  if (action === "decline") {
    if (review.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "Only a pending review can be declined."
      );
    }
    await ref.set(
      {
        status: "declined" satisfies ReviewStatus,
        resolvedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
    res.status(200).json({ ok: true, status: "declined" });
    return;
  }

  if (action === "accept") {
    if (review.status !== "pending") {
      throw new HttpsError(
        "failed-precondition",
        "Only a pending review can be accepted."
      );
    }
    if (!review.inputs || !review.recommendation) {
      throw new HttpsError("data-loss", "Weekly review is incomplete.");
    }
    const rec = review.recommendation;
    const bodyFeel =
      rec.volumeDelta < 0
        ? "sore"
        : rec.intensityDelta < 0
          ? "tired"
          : rec.intensityDelta > 0
            ? "great"
            : "ok";
    const adjustment = await persistDailyWorkoutAdjustment({
      uid,
      requestId: reviewId,
      bodyFeel,
      notes: review.inputs.notes,
      dayId: review.inputs.dayId,
      date: review.inputs.localDate,
      mods: {
        intensity: rec.intensityDelta,
        volume: rec.volumeDelta,
      },
      summary: rec.headline,
      source: "fallback",
      origin: "workout_check_in",
    });
    await ref.set(
      scrubUndefined({
        status: "accepted" satisfies ReviewStatus,
        resolvedAt: now,
        updatedAt: now,
        activeCalorieDelta: rec.calorieDelta,
        appliedAdjustment: adjustment
          ? { planId: adjustment.planId, date: adjustment.date }
          : null,
      }),
      { merge: true }
    );
    res.status(200).json({
      ok: true,
      status: "accepted",
      activeCalorieDelta: rec.calorieDelta,
      adjustment,
    });
    return;
  }

  if (review.status !== "accepted") {
    throw new HttpsError(
      "failed-precondition",
      "Only an accepted review can be undone."
    );
  }
  const planId = review.appliedAdjustment?.planId;
  const date = review.appliedAdjustment?.date;
  if (planId && date) {
    const adjustmentRef = db.doc(
      `users/${uid}/workoutPlans/${planId}/dailyAdjustments/${date}`
    );
    const adjustmentSnap = await adjustmentRef.get();
    if (
      adjustmentSnap.exists &&
      adjustmentSnap.data()?.requestId === reviewId
    ) {
      await adjustmentRef.delete();
    }
  }
  await ref.set(
    {
      status: "reverted" satisfies ReviewStatus,
      activeCalorieDelta: 0,
      revertedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  res.status(200).json({ ok: true, status: "reverted" });
}

async function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    throw new HttpsError("invalid-argument", "Method not allowed.");
  }
  const uid = await requireSubscriber(req);
  await enforceRateLimit({
    uid,
    key: "weeklyReview",
    limit: 20,
    windowMs: 60_000,
  });
  const action =
    typeof req.body?.action === "string" ? req.body.action.trim() : "";
  if (action === "recommend") {
    await recommend(uid, req, res);
    return;
  }
  if (action === "accept" || action === "decline" || action === "undo") {
    await resolveReview(uid, req, res, action);
    return;
  }
  throw new HttpsError("invalid-argument", "Unknown weekly review action.");
}

export const weeklyReview = onRequest(
  { invoker: "public", region: "us-central1" },
  withCors(async (req, res) => {
    try {
      await handler(req as unknown as Request, res as unknown as Response);
    } catch (error) {
      const code = errorCode(error);
      const status =
        code === "unauthenticated"
          ? 401
          : code === "invalid-argument"
            ? 400
            : code === "not-found"
              ? 404
              : statusFromCode(code);
      res.status(status).json({
        error: error instanceof Error ? error.message : "weekly_review_failed",
        code,
      });
    }
  })
);
