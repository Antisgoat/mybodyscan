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
    const next = value
      .map((entry) => scrubValue(entry))
      .filter((entry) => entry !== undefined) as JsonLike[];
    return next as T;
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

/**
 * Recursively removes any `undefined` values from objects and arrays so payloads
 * can be safely persisted to Firestore without triggering runtime errors.
 */
export function scrubUndefined<T>(value: T): T {
  return scrubValue(value as JsonLike) as T;
}
