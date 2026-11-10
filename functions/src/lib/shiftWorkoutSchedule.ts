import { HttpsError } from "firebase-functions/v2/https";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function shiftWorkoutSchedule<T extends { day: string }>(
  days: readonly T[],
  startDate: unknown,
  offset: unknown,
  expectedDays?: unknown
) {
  if (offset !== 1 && offset !== -1) {
    throw new HttpsError(
      "invalid-argument",
      "Schedule can only move one day at a time."
    );
  }
  if (
    (offset === -1 || expectedDays !== undefined) &&
    (!Array.isArray(expectedDays) ||
      expectedDays.length !== days.length ||
      days.some((day, index) => day.day !== expectedDays[index]))
  ) {
    throw new HttpsError(
      "failed-precondition",
      "Your schedule changed. Refresh before moving it again."
    );
  }
  const shifted = days.map((day) => {
    const index = weekdays.indexOf(day.day);
    if (index < 0)
      throw new HttpsError(
        "failed-precondition",
        "Plan has an invalid workout day."
      );
    return { ...day, day: weekdays[(index + offset + 7) % 7] };
  });
  let shiftedStartDate: string | undefined;
  if (typeof startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
    const date = new Date(`${startDate}T00:00:00.000Z`);
    if (Number.isFinite(date.getTime())) {
      date.setUTCDate(date.getUTCDate() + offset);
      shiftedStartDate = date.toISOString().slice(0, 10);
    }
  }
  return { days: shifted, startDate: shiftedStartDate };
}
