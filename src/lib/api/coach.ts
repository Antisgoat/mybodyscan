import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { ensureAppCheck } from "@/lib/appCheck";
import { functions } from "@/lib/firebase";

export type CoachChatContext = {
  todayCalories?: number;
  todayCaloriesGoal?: number;
  todayProteinGrams?: number;
  todayCarbGrams?: number;
  todayFatGrams?: number;
  todayProteinGoalGrams?: number;
  todayCarbGoalGrams?: number;
  todayFatGoalGrams?: number;
  lastScanDate?: string;
  lastScanBodyFatPercent?: number;
  nextWorkoutDayName?: string;
};

export interface CoachChatRequest {
  message: string;
  threadId?: string;
  messageId?: string;
  context?: CoachChatContext;
  // Legacy optional fields for older clients.
  goalType?: string;
  goalWeight?: number;
  currentWeight?: number;
  sex?: string;
  age?: number;
  heightCm?: number;
  activityLevel?: string;
}

export interface CoachChatMetadata {
  recommendedSplit?: string;
  caloriesPerDay?: number;
  macros?: { protein: number; carbs: number; fat: number };
}

export interface CoachChatResponse {
  replyText: string;
  planSummary?: string | null;
  metadata?: CoachChatMetadata;
  suggestions?: string[];
  debugId?: string;
  threadId?: string;
  assistantMessageId?: string;
}

type CoachChatCallableResponse = {
  reply?: string;
  suggestions?: unknown;
  threadId?: string;
  assistantMessageId?: string;
  meta?: {
    debugId?: string;
    metadata?: CoachChatMetadata;
    model?: string;
    tokens?: number;
  };
};

const callable = httpsCallable<CoachChatRequest, CoachChatCallableResponse>(
  functions,
  "coachChat"
);

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
    let message =
      error.message ||
      "Coach is unavailable right now; please try again shortly.";
    if (code.includes("invalid-argument")) {
      message = "Please enter a question for the coach.";
    } else if (code.includes("resource-exhausted")) {
      message =
        "You’ve hit the coach limit. Wait a moment before asking again.";
    } else if (code.includes("failed-precondition")) {
      message = "Coach is not fully configured. Please try again later.";
    } else if (code.includes("unavailable") || code.includes("internal")) {
      message = "Coach is unavailable right now; please try again shortly.";
    }
    const err = new Error(message);
    (err as Error & { code?: string; debugId?: string }).code =
      code || error.name;
    (err as Error & { code?: string; debugId?: string }).debugId =
      extractDebugId(error);
    return err;
  }

  if (error instanceof Error) return error;
  return new Error("Coach is unavailable right now; please try again shortly.");
}

function normalizeSuggestions(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cleaned = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0);
  return cleaned.length ? cleaned : undefined;
}

export async function coachChatApi(
  payload: CoachChatRequest
): Promise<CoachChatResponse> {
  await ensureAppCheck();
  try {
    const result = await callable(payload);
    const data = (result?.data ?? result) as CoachChatCallableResponse;
    const replyText =
      typeof data?.reply === "string" && data.reply.trim().length
        ? data.reply.trim()
        : "";
    if (!replyText) {
      throw new Error("Coach did not send a reply. Please try again.");
    }
    const metadata = data?.meta?.metadata;
    const planSummary = metadata?.recommendedSplit ?? null;
    const suggestions = normalizeSuggestions(data?.suggestions);
    const debugId = data?.meta?.debugId;
    return {
      replyText,
      planSummary,
      metadata,
      suggestions,
      debugId,
      threadId: typeof data?.threadId === "string" ? data.threadId : undefined,
      assistantMessageId:
        typeof data?.assistantMessageId === "string"
          ? data.assistantMessageId
          : undefined,
    };
  } catch (error) {
    throw normalizeError(error);
  }
}
