import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheck } from "@/lib/appCheck";
import { functions } from "@/lib/firebase";

export interface CoachChatRequest {
  message: string;
  goalType?: string;
  goalWeight?: number;
  currentWeight?: number;
  sex?: string;
  age?: number;
  heightCm?: number;
  activityLevel?: string;
}

export interface CoachChatResponse {
  ok: boolean;
  reply: string;
  metadata?: {
    recommendedSplit?: string;
    caloriesPerDay?: number;
    macros?: { protein: number; carbs: number; fat: number };
  };
}

const callable = httpsCallable<CoachChatRequest, CoachChatResponse>(functions, "coachChat");

function normalizeError(error: unknown): Error {
  if (error instanceof FirebaseError) {
    const code = error.code ?? "";
    let message = error.message || "Coach is unavailable right now; please try again shortly.";
    if (code.includes("invalid-argument")) {
      message = "Please enter a question for the coach.";
    } else if (code.includes("resource-exhausted")) {
      message = "You’ve hit the coach limit. Wait a moment before asking again.";
    } else if (code.includes("failed-precondition")) {
      message = "Coach is not fully configured. Please try again later.";
    } else if (code.includes("unavailable")) {
      message = "Coach is unavailable right now; please try again shortly.";
    }
    const err = new Error(message);
    (err as Error & { code?: string }).code = code || error.name;
    return err;
  }

  if (error instanceof Error) return error;
  return new Error("Coach is unavailable right now; please try again shortly.");
}

export async function coachChatApi(payload: CoachChatRequest): Promise<CoachChatResponse> {
  await ensureAppCheck();
  try {
    const result = await callable(payload);
    const data = (result?.data ?? result) as CoachChatResponse;
    const reply = typeof data?.reply === "string" && data.reply.trim().length ? data.reply : "";
    if (!reply) {
      throw new Error("Coach did not send a reply. Please try again.");
    }
    return {
      ok: data?.ok !== false,
      reply,
      metadata: data?.metadata,
    };
  } catch (error) {
    throw normalizeError(error);
  }
}
