import { FirebaseError } from "firebase/app";
import { httpsCallable } from "firebase/functions";
import { apiFetchJson } from "@/lib/apiFetch";
import { ensureAppCheck } from "@/lib/appCheck";
import { functions } from "@/lib/firebase";
import { isCapacitorNative } from "@/lib/platform/isNative";

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
  localDate?: string;
  localDayName?: string;
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
  planAdaptation?: {
    applied: true;
    date: string;
    dayId: string;
    bodyFeel: "tired" | "sore";
    summary: string;
    origin: "coach_chat";
  };
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
  text?: string;
  answer?: string;
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
  const maybe = error as any;
  if (typeof maybe?.status === "number") {
    const status = Number(maybe.status) || 0;
    const payload = maybe?.payload;
    const backendCode =
      typeof payload?.error?.code === "string"
        ? payload.error.code
        : typeof payload?.code === "string"
          ? payload.code
          : undefined;
    const err = new Error(
      status === 0
        ? "Coach is offline right now. Check your connection and try again."
        : `Coach unavailable${backendCode ? ` (${backendCode})` : ""}. Please try again shortly.`
    );
    (err as Error & { code?: string; status?: number }).code =
      backendCode || `http_${status}`;
    (err as Error & { code?: string; status?: number }).status = status;
    return err;
  }

  if (error instanceof FirebaseError) {
    const code = error.code ?? "";
    let message =
      error.message ||
      "Coach is unavailable right now; please try again shortly.";
    if (code.includes("invalid-argument")) {
      message = "Please enter a question for the coach.";
    } else if (code.includes("unauthenticated")) {
      message = "Please sign in again to use coach chat.";
    } else if (code.includes("permission-denied")) {
      message =
        "Coach is available on an active plan or Unlimited. Visit Plans to activate your account.";
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

function mapCoachPayload(data: any): CoachChatResponse {
  const replyText =
    typeof data?.reply === "string" && data.reply.trim().length
      ? data.reply.trim()
      : typeof data?.text === "string" && data.text.trim().length
        ? data.text.trim()
        : typeof data?.answer === "string" && data.answer.trim().length
          ? data.answer.trim()
          : "";
  if (!replyText) {
    throw new Error("Coach did not send a reply. Please try again.");
  }
  const metadata = data?.meta?.metadata;
  return {
    replyText,
    planSummary: metadata?.recommendedSplit ?? null,
    metadata,
    suggestions: normalizeSuggestions(data?.suggestions),
    debugId: data?.meta?.debugId ?? data?.debugId,
    threadId: typeof data?.threadId === "string" ? data.threadId : undefined,
    assistantMessageId:
      typeof data?.assistantMessageId === "string"
        ? data.assistantMessageId
        : undefined,
  };
}

export async function coachChatApi(
  payload: CoachChatRequest
): Promise<CoachChatResponse> {
  await ensureAppCheck();

  const callHttp = async () => {
    const data = await apiFetchJson<any>("/coach/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return mapCoachPayload(data);
  };

  try {
    if (isCapacitorNative()) {
      return await callHttp();
    }
    const result = await callable(payload);
    const data = (result?.data ?? result) as CoachChatCallableResponse;
    return mapCoachPayload(data);
  } catch (error: any) {
    const code = String(error?.code || "");
    if (
      code.includes("functions/internal") ||
      code.includes("functions/unavailable") ||
      code.includes("functions/unknown")
    ) {
      try {
        return await callHttp();
      } catch (httpError) {
        throw normalizeError(httpError);
      }
    }
    throw normalizeError(error);
  }
}
