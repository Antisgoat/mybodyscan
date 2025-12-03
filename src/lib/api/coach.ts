import { call } from "@/lib/callable";

export interface CoachChatResponse {
  reply: string;
  uid?: string | null;
  error?: string;
  message?: string;
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
  const response = await call<CoachChatPayload, CoachChatResponse>("coachChat", payload);
  const data = (response as any)?.data ?? response;
  const reply = (data as any)?.reply ?? (data as any)?.text ?? "";
  return { ...data, reply } as CoachChatResponse;
}
