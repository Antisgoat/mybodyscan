import { apiPost } from "@/lib/http";
import { resolveFunctionUrl } from "@/lib/api/functionsBase";

function coachUrl(): string {
  return resolveFunctionUrl("VITE_COACH_URL", "coachChat");
}

export async function askCoach(message: string, extras?: { history?: Array<{ role: "user" | "assistant"; content: string }>; profile?: Record<string, unknown> }) {
  const payload: Record<string, unknown> = { message };
  if (extras?.history) payload.history = extras.history;
  if (extras?.profile) payload.profile = extras.profile;
  return apiPost<{ reply?: string; error?: string }>(coachUrl(), payload);
}
