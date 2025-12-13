export type TimestampLike =
  | Date
  | { toDate?: () => Date }
  | { toMillis?: () => number }
  | { seconds?: number; nanoseconds?: number }
  | string
  | number
  | null
  | undefined;

export function toDateOrNull(value: TimestampLike): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object") {
    if (typeof (value as any).toDate === "function") {
      try {
        const date = (value as any).toDate();
        return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
      } catch {
        return null;
      }
    }
    if (typeof (value as any).toMillis === "function") {
      try {
        const ms = (value as any).toMillis();
        if (!Number.isFinite(ms)) return null;
        const date = new Date(ms);
        return Number.isNaN(date.getTime()) ? null : date;
      } catch {
        return null;
      }
    }
    if (typeof (value as any).seconds === "number") {
      const date = new Date((value as any).seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

export function formatDateTime(value: TimestampLike): string {
  const date = toDateOrNull(value);
  return date ? date.toLocaleString() : "—";
}

