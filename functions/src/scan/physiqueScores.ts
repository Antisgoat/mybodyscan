export const PHYSIQUE_SCORE_KEYS = [
  "chest",
  "back",
  "shoulders",
  "arms",
  "core",
  "legs",
] as const;

export type PhysiqueScoreKey = (typeof PHYSIQUE_SCORE_KEYS)[number];
export type PhysiqueScores = Partial<Record<PhysiqueScoreKey, number>>;

/**
 * Accept explicit visual-development scores only. The scan model may omit any
 * region it cannot assess reliably. This helper never manufactures a score
 * from prose or from another body-composition measurement.
 */
export function sanitizePhysiqueScores(value: unknown): PhysiqueScores {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const result: PhysiqueScores = {};

  for (const key of PHYSIQUE_SCORE_KEYS) {
    const raw = source[key];
    if (typeof raw !== "number") continue;
    if (!Number.isFinite(raw)) continue;
    result[key] = Math.round(Math.min(100, Math.max(0, raw)));
  }

  return result;
}

export const PHYSIQUE_SCORE_MODEL_INSTRUCTION = [
  "Optionally score visible muscular development for chest, back, shoulders, arms, core, and legs from 0 to 100.",
  "Scores describe only visible development and balance in these four photos; they are not strength, health, diagnosis, body-fat distribution, or exact muscle-mass measurements.",
  "Use all four views. Omit a region when clothing, pose, crop, or image quality makes it unreliable.",
  "Apply the same conservative visual rubric across scans so the score is useful mainly as a personal progress trend.",
].join(" ");
