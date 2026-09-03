import { HttpsError } from "firebase-functions/v2/https";

/** A diary day is already a local calendar date, not a UTC instant. */
export function normalizeNutritionDate(
  value: unknown,
  offsetMins: number
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpsError("invalid-argument", "A valid diary date is required.");
  }
  const input = value.trim();
  const date = new Date(input);
  if (!Number.isFinite(date.getTime())) {
    throw new HttpsError("invalid-argument", "A valid diary date is required.");
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    // Reject dates such as February 30 instead of silently rolling them forward.
    if (date.toISOString().slice(0, 10) !== input) {
      throw new HttpsError("invalid-argument", "A valid diary date is required.");
    }
    return input;
  }
  // Legacy callers can send a timestamp. Only those inputs need conversion
  // using the client's getTimezoneOffset(); arithmetic is server-zone neutral.
  const offset = Number.isFinite(offsetMins) ? offsetMins : 0;
  if (Math.abs(offset) > 14 * 60) {
    throw new HttpsError("invalid-argument", "Invalid diary timezone offset.");
  }
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
}
