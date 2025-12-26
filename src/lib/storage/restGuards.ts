const FORBIDDEN_REGEXES = [
  /firebasestorage\.googleapis\.com\/v0\/b\//i,
  /o\?name=/i,
  /o%3fname%3d/i,
];

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
