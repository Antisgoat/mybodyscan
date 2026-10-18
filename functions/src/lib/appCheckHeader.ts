type HeaderValue = string | string[] | undefined;

/** Reads the canonical Firebase App Check HTTP header after Node normalization. */
export function readFirebaseAppCheckHeader(
  headers: Record<string, HeaderValue> | undefined
): string {
  const raw = headers?.["x-firebase-appcheck"];
  if (Array.isArray(raw)) return String(raw[0] ?? "").trim();
  return typeof raw === "string" ? raw.trim() : "";
}
