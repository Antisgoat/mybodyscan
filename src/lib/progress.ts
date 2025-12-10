export function toVisiblePercent(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  const numeric = value as number;
  if (numeric <= 0) return 0;
  return Math.min(100, Math.max(1, Math.round(numeric * 100)));
}

export function toProgressBarWidth(value: number | null | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  const numeric = Math.min(1, Math.max(0, value as number));
  if (numeric <= 0) return 0;
  return Math.min(100, Math.max(1, numeric * 100));
}
