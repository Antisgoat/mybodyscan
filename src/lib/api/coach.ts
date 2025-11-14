import { apiPost } from "@/lib/http";

function getCoachUrl(): string {
  const env = (import.meta as any).env || {};
  return env.VITE_COACH_URL || "/api/coach/chat" || "/api/coachChat";
}

export async function askCoach(message: string): Promise<any> {
  return apiPost(getCoachUrl(), { message });
}
