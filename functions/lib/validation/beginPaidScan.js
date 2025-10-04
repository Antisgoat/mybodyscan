const MAX_SCAN_ID = 128;
const MAX_HASH_LENGTH = 256;
const MAX_HASHES = 10;
function sanitizeToken(value, maxLength) {
    return value
        .normalize("NFKC")
        .replace(/[^A-Za-z0-9_-]/g, "")
        .slice(0, maxLength);
}
function sanitizeScanId(value) {
    if (typeof value !== "string")
        return "";
    const trimmed = value.trim();
    if (!trimmed)
        return "";
    return sanitizeToken(trimmed, MAX_SCAN_ID);
}
function sanitizeHash(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    if (!trimmed)
        return null;
    const sanitized = sanitizeToken(trimmed, MAX_HASH_LENGTH);
    if (!sanitized)
        return null;
    return sanitized;
}
export function validateBeginPaidScanPayload(input) {
    const errors = [];
    const body = (input || {});
    const scanId = sanitizeScanId(body.scanId);
    if (!scanId) {
        errors.push("scanId");
    }
    const hashesInput = Array.isArray(body.hashes) ? body.hashes : [];
    const sanitizedHashes = hashesInput
        .map((hash) => sanitizeHash(hash))
        .filter((hash) => Boolean(hash));
    if (!sanitizedHashes.length) {
        errors.push("hashes");
    }
    else if (sanitizedHashes.length > MAX_HASHES) {
        sanitizedHashes.length = MAX_HASHES;
    }
    const gateScore = Number(body.gateScore);
    if (!Number.isFinite(gateScore) || gateScore < 0 || gateScore > 100) {
        errors.push("gateScore");
    }
    const rawMode = typeof body.mode === "string" ? body.mode : "2";
    const mode = rawMode === "4" ? "4" : "2";
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
//# sourceMappingURL=beginPaidScan.js.map