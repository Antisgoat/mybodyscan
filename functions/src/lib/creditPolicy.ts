export const DEFAULT_CREDIT_EXPIRY_MONTHS = 12;

export function getCreditExpiryMonths(
  rawValue: string | undefined = process.env.CREDIT_EXP_MONTHS
): number {
  if (!rawValue) return DEFAULT_CREDIT_EXPIRY_MONTHS;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CREDIT_EXPIRY_MONTHS;
  }
  return Math.floor(parsed);
}
