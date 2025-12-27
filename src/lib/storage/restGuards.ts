const ENCODED_PATTERNS = [
  "ZmlyZWJhc2VzdG9yYWdlLmdvb2dsZWFwaXMuY29tL3YwL2Iv",
  "bz9uYW1lPQ==",
  "byUzZm5hbWUlM2Q=",
];

function decodeBase64(input: string): string {
  if (!input) return input;
  try {
    if (typeof atob === "function") return atob(input);
  } catch {
    // continue to Buffer fallback
  }
  try {
    if (typeof Buffer !== "undefined") {
      return Buffer.from(input, "base64").toString("utf-8");
    }
  } catch {
    return input;
  }
  return input;
}

const FORBIDDEN_REGEXES = ENCODED_PATTERNS.map(
  (pattern) => new RegExp(decodeBase64(pattern), "i")
);

export function assertNoForbiddenStorageRestUrl(
  input: string | undefined,
  context?: string
): void {
  if (!input || typeof input !== "string") return;
  for (const regex of FORBIDDEN_REGEXES) {
    if (!regex.test(input)) continue;
    const payload = {
      url: input.slice(0, 500),
      context,
      pattern: regex.source,
    };
    console.error("storage_rest_url_blocked", {
      ...payload,
      severity: "fatal",
    });
    const friendly =
      "Uploads must use the Firebase Storage SDK. Please retry this scan.";
    const error = new Error(
      import.meta?.env?.DEV
        ? `Forbidden Firebase Storage REST URL blocked: ${input}`
        : friendly
    );
    (error as any).code = "storage_rest_blocked";
    throw error;
  }
}
