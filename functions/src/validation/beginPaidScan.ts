import type { ValidationResult } from "./types.js";

export interface BeginPaidScanPayload {
  scanId: string;
  hashes: string[];
  gateScore: number;
  mode: "2" | "4";
}

const MAX_SCAN_ID = 128;
const MAX_HASH_LENGTH = 256;
const MAX_HASHES = 10;

function sanitizeToken(value: string, maxLength: number): string {
  return value
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, maxLength);
}

function sanitizeScanId(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return sanitizeToken(trimmed, MAX_SCAN_ID);
}

function sanitizeHash(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const sanitized = sanitizeToken(trimmed, MAX_HASH_LENGTH);
  if (!sanitized) return null;
  return sanitized;
}

export function validateBeginPaidScanPayload(
  input: unknown
): ValidationResult<BeginPaidScanPayload> {
  const errors: string[] = [];
  const body = (input || {}) as Record<string, unknown>;
  const scanId = sanitizeScanId(body.scanId);
  if (!scanId) {
    errors.push("scanId");
  }

  const hashesInput = Array.isArray(body.hashes) ? body.hashes : [];
  const sanitizedHashes = hashesInput
    .map((hash) => sanitizeHash(hash))
    .filter((hash): hash is string => Boolean(hash));

  if (!sanitizedHashes.length) {
    errors.push("hashes");
  } else if (sanitizedHashes.length > MAX_HASHES) {
    sanitizedHashes.length = MAX_HASHES;
  }

  const gateScore = Number(body.gateScore);
  if (!Number.isFinite(gateScore) || gateScore < 0 || gateScore > 100) {
    errors.push("gateScore");
  }

  const rawMode = typeof body.mode === "string" ? body.mode : "2";
  const mode: "2" | "4" = rawMode === "4" ? "4" : "2";

  if (errors.length) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      scanId,
      hashes: Array.from(new Set(sanitizedHashes)),
      gateScore: Math.round(gateScore),
      mode,
    },
  };
}
