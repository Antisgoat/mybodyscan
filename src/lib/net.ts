/** Emit a transient network error banner + allow host to also toast/log. */
export function netError(message?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("mbs:net:error", {
        detail: { message: message || "Network error" },
      })
    );
  } catch {
    // ignore
  }
}
