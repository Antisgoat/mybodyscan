import { apiFetchJson } from "@/lib/apiFetch";

export interface CoachChatResponse {
  reply: string;
  uid?: string | null;
}

export interface CoachChatPayload {
  message: string;
  goal?: string;
  sex?: string;
  age?: number;
  currentWeightKg?: number;
  targetWeightKg?: number;
  heightCm?: number;
}

export async function coachChatApi(payload: CoachChatPayload): Promise<CoachChatResponse> {
  return apiFetchJson<CoachChatResponse>("/coach/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
