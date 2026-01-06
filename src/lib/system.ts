import { apiFetch, apiFetchJson } from "@/lib/apiFetch";
import { auth } from "@/lib/firebase";

type BootstrapResponse = {
  ok: boolean;
  admin: boolean;
  credits: number;
  claimsUpdated?: boolean;
};

const SOFT_BOOTSTRAP_STATUSES = new Set([404, 405]);

function isSoftBootstrapStatus(status?: number): boolean {
  return typeof status === "number" && SOFT_BOOTSTRAP_STATUSES.has(status);
}

export async function bootstrapSystem(): Promise<BootstrapResponse | null> {
  const user = auth?.currentUser ?? null;
  if (!user) return null;

  try {
    const response = await apiFetch("/system/bootstrap", { method: "POST" });
    if (isSoftBootstrapStatus(response.status)) {
      console.info("system_bootstrap_unavailable", { status: response.status });
      return null;
    }

    if (!response.ok) {
      const fallbackMessage = `HTTP ${response.status}`;
      const text = await response.text().catch(() => "");
      const error = new Error(text || fallbackMessage) as Error & {
        status?: number;
      };
      error.status = response.status;
      throw error;
    }

    const contentType = response.headers.get("Content-Type") || "";
    const payload = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);

    return payload && typeof payload === "object"
      ? (payload as BootstrapResponse)
      : null;
  } catch (error) {
    const typedError = error as Error & { status?: number };
    const status =
      typeof typedError?.status === "number" ? typedError.status : undefined;
    if (isSoftBootstrapStatus(status)) {
      console.info("system_bootstrap_unavailable", {
        status,
        message: typedError?.message,
      });
      return null;
    }
    console.error("system_bootstrap_failed", error);
    throw typedError instanceof Error
      ? typedError
      : new Error("bootstrap_failed");
  }
}

export async function fetchSystemHealth(): Promise<any | null> {
  return apiFetchJson("/system/health");
}
