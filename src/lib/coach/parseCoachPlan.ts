import { toDateOrNull } from "@/lib/time";
import type { CoachPlan, CoachPlanBlock, CoachPlanSession } from "@/lib/coach/types";

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseBlock(value: unknown): CoachPlanBlock | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const title = asString(v.title) ?? "";
  const focus = asString(v.focus) ?? "";
  const work = Array.isArray(v.work)
    ? v.work.map((item) => (typeof item === "string" ? item : "")).filter(Boolean)
    : [];
  return { title, focus, work };
}

function parseSession(value: unknown): CoachPlanSession | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const day = asString(v.day) ?? "";
  const blocks = Array.isArray(v.blocks)
    ? v.blocks.map(parseBlock).filter(Boolean) as CoachPlanBlock[]
    : [];
  return { day, blocks };
}

/**
 * Safe model layer for `users/{uid}/coach/plan`.
 * - Missing doc should be handled by caller (`null`).
 * - Existing doc is normalized into a stable shape.
 * - `updatedAt` is normalized to `Date | null` (never undefined).
 */
export function parseCoachPlanDocData(raw: unknown): CoachPlan {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const days = asNumber(obj.days) ?? 0;
  const split = asString(obj.split) ?? "";
  const sessions = Array.isArray(obj.sessions)
    ? (obj.sessions.map(parseSession).filter(Boolean) as CoachPlanSession[])
    : [];

  const progressionRaw = obj.progression && typeof obj.progression === "object"
    ? (obj.progression as Record<string, unknown>)
    : null;
  const deloadEvery = asNumber(progressionRaw?.deloadEvery) ?? 4;

  const calorieTarget = asNumber(obj.calorieTarget) ?? 0;
  const proteinFloor = asNumber(obj.proteinFloor) ?? 0;
  const disclaimer = asString(obj.disclaimer) ?? undefined;

  const updatedAt = toDateOrNull(obj.updatedAt);

  return {
    days,
    split,
    sessions,
    progression: { deloadEvery },
    calorieTarget,
    proteinFloor,
    disclaimer,
    updatedAt,
  };
}

