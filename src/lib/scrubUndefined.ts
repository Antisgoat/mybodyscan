/**
 * Removes any `undefined` values from plain objects or arrays so we can safely
 * send payloads to Firestore without tripping the client-side runtime checks.
 * Mirrors the Cloud Functions helper to keep data contracts consistent.
 */
type JsonLike =
  | Record<string, unknown>
  | Array<JsonLike>
  | string
  | number
  | boolean
  | null
  | undefined;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function scrubValue<T extends JsonLike>(value: T): T {
  if (value === undefined || value === null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => scrubValue(entry))
      .filter((entry) => entry !== undefined) as T;
  }
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const scrubbed = scrubValue(child as JsonLike);
      if (scrubbed !== undefined) {
        result[key] = scrubbed;
      }
    }
    return result as T;
  }
  return value;
}

export function scrubUndefined<T>(value: T): T {
  return scrubValue(value as JsonLike) as T;
}
