import { URL } from "node:url";

// Diagnostics must not become a secondary store for credentials or body photos.
const SENSITIVE_KEY =
  /authorization|password|secret|token|api.?key|cookie|photo|image|base64|email/i;
export function diagnosticText(value: unknown, limit: number): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  return value
    .trim()
    .slice(0, limit)
    .replace(/Bearer\s+[-A-Za-z0-9._~+/]+=*/gi, "Bearer [redacted]")
    .replace(
      /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[token redacted]"
    )
    .replace(/\b(?:sk|rk)_(?:live|test|proj)_?[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/data:image\/[^\s]+/gi, "[image redacted]")
    .replace(/https?:\/\/[^\s"'<>]+/g, (raw) => {
      try {
        const url = new URL(raw);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return "[url redacted]";
      }
    });
}

export function diagnosticExtra(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value == null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return diagnosticText(value, 320);
  if (Array.isArray(value))
    return value.slice(0, 10).map((v) => diagnosticExtra(v, depth + 1));
  if (typeof value !== "object") return null;
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 20)
      .filter(
        ([key]) => !["__proto__", "constructor", "prototype"].includes(key)
      )
      .map(([key, child]) => [
        key.slice(0, 80),
        SENSITIVE_KEY.test(key)
          ? "[redacted]"
          : diagnosticExtra(child, depth + 1),
      ])
  );
}
