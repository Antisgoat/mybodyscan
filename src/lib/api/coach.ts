import { apiPost } from "@/lib/http";
export async function askCoach(message: string) {
  return apiPost("/api/coach/chat", { message });
}
