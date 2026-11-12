import { localDateKey } from "@/lib/time";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function nextScheduledWorkout(
  days: readonly string[],
  from = new Date()
) {
  const date = new Date(from);
  for (let offset = 0; offset < 7; offset++) {
    const dayId = weekdays[date.getDay()];
    if (days.includes(dayId)) return { dayId, localDate: localDateKey(date) };
    date.setDate(date.getDate() + 1);
  }
  return null;
}
