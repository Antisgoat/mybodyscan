export function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }
  const anyValue = value as any;
  if (typeof anyValue?.toDate === "function") {
    try {
      const date = anyValue.toDate();
      return date instanceof Date && Number.isFinite(date.getTime()) ? date : null;
    } catch {
      return null;
    }
  }
  if (typeof anyValue?.seconds === "number") {
    const date = new Date(anyValue.seconds * 1000);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function formatTimestamp(value: unknown): string {
  const date = toDateOrNull(value);
  return date ? date.toLocaleString() : "—";
}
