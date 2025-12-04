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
  ok: true;
  replyText: string;
  planSummary?: string | null;
  metadata?: {
    recommendedSplit?: string;
    caloriesPerDay?: number;
    macros?: { protein: number; carbs: number; fat: number };
  };
  debugId?: string;
}

const callable = httpsCallable<CoachChatRequest, CoachChatResponse>(functions, "coachChat");

function extractDebugId(error: FirebaseError): string | undefined {
  const serverResponse = error.customData?.serverResponse;
  const details = (serverResponse as any)?.details;
  if (details && typeof details === "object") {
    return details.debugId || details?.details?.debugId;
  }
  return undefined;
}

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
    } else if (code.includes("unavailable") || code.includes("internal")) {
      message = "Coach is unavailable right now; please try again shortly.";
    }
    const err = new Error(message);
    (err as Error & { code?: string; debugId?: string }).code = code || error.name;
    (err as Error & { code?: string; debugId?: string }).debugId = extractDebugId(error);
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
    const replyText = typeof data?.replyText === "string" && data.replyText.trim().length ? data.replyText.trim() : "";
    if (!replyText) {
      throw new Error("Coach did not send a reply. Please try again.");
    }
    return {
      ok: true,
      replyText,
      planSummary: data?.planSummary ?? data?.metadata?.recommendedSplit ?? null,
      metadata: data?.metadata,
      debugId: data?.debugId,
    };
  } catch (error) {
    throw normalizeError(error);
  }
}
