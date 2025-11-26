import { apiFetch } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";

function apiBase(): string {
  return resolveFunctionUrl("VITE_API_BASE_URL", "api");
}

export async function askCoach(message: string) {
  const url = `${apiBase().replace(/\/$/, "")}/coach/chat`;
  return apiFetch<{ reply?: string; error?: string }>(url, { method: "POST", body: { question: message } });
}
