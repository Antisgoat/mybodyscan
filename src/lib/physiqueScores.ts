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

export type PhysiqueScoreItem = {
  key: PhysiqueScoreKey;
  label: string;
  score: number;
};

export const PHYSIQUE_SCORE_LABELS: Record<PhysiqueScoreKey, string> = {
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
  legs: "Legs",
};

function finiteScore(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(Math.min(100, Math.max(0, parsed)));
}

/**
 * Normalizes explicit photo-based development scores only.
 *
 * This deliberately does not infer a numeric score from qualitative prose. A
 * score must come from an explicit scoring field produced by the scan pipeline.
 */
export function normalizePhysiqueScores(value: unknown): PhysiqueScores {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const normalized: PhysiqueScores = {};

  for (const key of PHYSIQUE_SCORE_KEYS) {
    const score = finiteScore(source[key]);
    if (score != null) normalized[key] = score;
  }

  return normalized;
}

export function physiqueScoreItems(value: unknown): PhysiqueScoreItem[] {
  const scores = normalizePhysiqueScores(value);
  return PHYSIQUE_SCORE_KEYS.flatMap((key) => {
    const score = scores[key];
    return score == null
      ? []
      : [{ key, label: PHYSIQUE_SCORE_LABELS[key], score }];
  });
}

export function physiquePriorityAreas(
  value: unknown,
  limit = 2
): PhysiqueScoreItem[] {
  return physiqueScoreItems(value)
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, limit));
}

export function physiqueStrengthAreas(
  value: unknown,
  limit = 2
): PhysiqueScoreItem[] {
  return physiqueScoreItems(value)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, Math.max(0, limit));
}

export function physiqueOverallScore(value: unknown): number | null {
  const items = physiqueScoreItems(value);
  // Avoid presenting an overall score from a sparse scan.
  if (items.length < 4) return null;
  return Math.round(
    items.reduce((sum, item) => sum + item.score, 0) / items.length
  );
}

export const PHYSIQUE_SCORE_DISCLOSURE =
  "Photo-based development score for progress tracking. It is not a strength, medical, or diagnostic measurement.";
