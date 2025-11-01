const ENDPOINT = "https://identitytoolkit.googleapis.com/v1/projects/mybodyscan-f3daf/config";

export type IdentityToolkitStatus = {
  reachable: boolean;
  reason?: string;
};

export async function checkIdentityToolkitReachability(
  apiKey?: string,
  options?: { signal?: AbortSignal },
): Promise<IdentityToolkitStatus> {
  const trimmed = apiKey?.trim() || (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim();
  if (!trimmed) {
    return { reachable: false, reason: "missing_api_key" };
  }

  try {
    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(trimmed)}`, {
      method: "GET",
      signal: options?.signal,
    });
    if (!response.ok) {
      let reason: string | undefined;
      try {
        const payload = (await response.json()) as { error?: { message?: string } };
        if (payload?.error?.message) {
          reason = payload.error.message;
        }
      } catch {
        // ignore parse error; fall back to status code reason
      }
      if (!reason) {
        reason = `status_${response.status}`;
      }
      return { reachable: false, reason };
    }
    return { reachable: true };
  } catch (error: unknown) {
    const message =
      error && typeof error === "object" && "name" in error && (error as { name?: string }).name === "AbortError"
        ? "aborted"
        : "network_error";
    if (message === "aborted") {
      throw error;
    }
    return { reachable: false, reason: message };
  }
}
