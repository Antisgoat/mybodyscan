export const MBS_FriendlyErrors: Record<string, string> = {
  ANALYSIS_FAILED:
    "We couldn't analyze this scan. Try brighter lighting or clearer angles.",
  UPLOAD_FAILED: "Upload interrupted. Check your connection and retry.",
  AUTH_REQUIRED: "Please sign in to continue.",
};

export function toFriendlyMBS(e: any) {
  const k = typeof e?.message === "string" ? e.message : "";
  return MBS_FriendlyErrors[k] ?? "Something went wrong. Please try again.";
}
