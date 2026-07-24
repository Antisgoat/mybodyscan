export function sanitizeReturnTo(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  // Browsers normalize backslashes in special-scheme URLs. Reject them before
  // passing user-controlled destinations to React Router so `/\example.com`
  // cannot become a protocol-relative external redirect.
  if (trimmed.includes("\\") || /%(?:2f|5c)/i.test(trimmed)) return null;

  const base = "https://mybodyscan.invalid";
  try {
    const parsed = new URL(trimmed, base);
    if (parsed.origin !== base) return null;
    return `${parsed.pathname}${parsed.search}${parsed.hash}` || "/";
  } catch {
    return null;
  }
}
