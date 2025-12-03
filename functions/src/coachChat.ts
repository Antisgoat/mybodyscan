import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { getAuth } from "./firebase.js";
import { chatOnce, OpenAIClientError } from "./openai/client.js";
import { identifierFromRequest } from "./http/_middleware.js";
import { ensureSoftAppCheckFromCallable, ensureSoftAppCheckFromRequest } from "./lib/appCheckSoft.js";

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

export interface CoachChatSuccessResponse {
  ok: true;
  replyText: string;
  planSummary?: string | null;
  metadata?: {
    recommendedSplit?: string;
    caloriesPerDay?: number;
    macros?: { protein: number; carbs: number; fat: number };
  };
  debugId: string;
}

export interface CoachChatErrorResponse {
  ok: false;
  code: string;
  message: string;
  debugId: string;
}

export type CoachChatResponse = CoachChatSuccessResponse | CoachChatErrorResponse;

type RequestContext = {
  uid: string | null;
  identifier: string;
  requestId: string;
};

function sanitizeMessage(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .split("")
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code < 32 && code !== 10 && code !== 13) return " ";
      return char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const num = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(num) ? Number(num) : undefined;
}

function normalizePayload(data: unknown): CoachChatRequest {
  const payload = (typeof data === "object" && data !== null ? data : {}) as Partial<CoachChatRequest>;
  return {
    message: sanitizeMessage(payload.message),
    goalType: sanitizeMessage(payload.goalType),
    goalWeight: toNumber(payload.goalWeight),
    currentWeight: toNumber(payload.currentWeight),
    sex: sanitizeMessage(payload.sex),
    age: toNumber(payload.age),
    heightCm: toNumber(payload.heightCm),
    activityLevel: sanitizeMessage(payload.activityLevel),
  };
}

function buildPrompt(input: CoachChatRequest): string {
  const context: string[] = [];
  if (input.goalType) context.push(`Goal focus: ${input.goalType}`);
  if (input.currentWeight) context.push(`Current weight: ${input.currentWeight} kg`);
  if (input.goalWeight) context.push(`Goal weight: ${input.goalWeight} kg`);
  if (input.heightCm) context.push(`Height: ${input.heightCm} cm`);
  if (input.sex) context.push(`Sex: ${input.sex}`);
  if (input.age) context.push(`Age: ${input.age}`);
  if (input.activityLevel) context.push(`Activity level: ${input.activityLevel}`);

  const lines: string[] = [];
  lines.push("Provide a concise, motivational yet practical answer for the user below.");
  if (context.length) {
    lines.push("Context:");
    lines.push(...context);
  }
  lines.push("Question:");
  lines.push(input.message);
  lines.push(
    "Respond in 2-3 short paragraphs max. Prioritize safety, progressive overload, recovery, and nutrition.",
  );
  lines.push(
    'After your reply, add a line exactly once: METADATA: {"recommendedSplit":"...", "caloriesPerDay":1234, "macros":{"protein":150,"carbs":200,"fat":60}}. Omit fields instead of guessing wildly.',
  );
  return lines.join("\n");
}

function parseMetadataLine(source: string): { replyText: string; metadata?: CoachChatResponse["metadata"] } {
  const match = source.match(/(?:^|\n)METADATA:\s*(\{[\s\S]*\})\s*$/i);
  if (!match) {
    return { replyText: source.trim() };
  }
  const metadataRaw = match[1];
  let metadata: CoachChatResponse["metadata"] | undefined;
  try {
    const parsed = JSON.parse(metadataRaw) as CoachChatResponse["metadata"];
    const protein = toNumber(parsed?.macros?.protein);
    const carbs = toNumber(parsed?.macros?.carbs);
    const fat = toNumber(parsed?.macros?.fat);
    metadata = {
      recommendedSplit: typeof parsed?.recommendedSplit === "string" ? parsed.recommendedSplit : undefined,
      caloriesPerDay: toNumber(parsed?.caloriesPerDay),
      macros:
        protein || carbs || fat
          ? {
              protein: protein ?? 0,
              carbs: carbs ?? 0,
              fat: fat ?? 0,
            }
          : undefined,
    };
  } catch (error) {
    logger.warn("coachChat.metadata.parse_failed", { message: (error as Error)?.message });
  }
  const replyText = source.replace(match[0], "").trim();
  return { replyText: replyText || source.trim(), metadata };
}

async function generateCoachResponse(payload: CoachChatRequest, context: RequestContext): Promise<CoachChatSuccessResponse> {
  const prompt = buildPrompt(payload);
  const answer = await chatOnce(prompt, {
    userId: context.uid ?? undefined,
    requestId: context.requestId,
  });
  const { replyText, metadata } = parseMetadataLine(answer);
  return {
    ok: true,
    replyText,
    planSummary: metadata?.recommendedSplit ?? null,
    metadata,
    debugId: context.requestId,
  };
}

function toHttpsError(error: unknown, debugId: string): HttpsError {
  const attachDetails = (details?: any) =>
    typeof details === "object" && details !== null ? { ...details, debugId } : { debugId };

  if (error instanceof HttpsError) {
    return new HttpsError(error.code, error.message, attachDetails(error.details));
  }
  if (error instanceof OpenAIClientError) {
    if (error.code === "openai_missing_key") {
      return new HttpsError("failed-precondition", "Coach is not configured. Please try again later.", {
        debugId,
        reason: error.code,
      });
    }
    return new HttpsError("unavailable", "Coach is temporarily unavailable. Please try again.", {
      debugId,
      reason: error.code,
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new HttpsError("internal", "Coach is temporarily unavailable. Please try again.", {
    debugId,
    reason: message || "unknown_error",
  });
}

function httpStatusFromHttpsError(error: HttpsError): number {
  const status = (error as any)?.httpErrorCode?.status;
  if (typeof status === "number") {
    return status;
  }
  switch (error.code) {
    case "invalid-argument":
      return 400;
    case "failed-precondition":
      return 412;
    case "resource-exhausted":
      return 429;
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    case "unavailable":
      return 503;
    default:
      return 500;
  }
}

async function resolveUidFromRequest(req: Request): Promise<string | null> {
  const header = req.get("Authorization") || req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const idToken = header.slice("Bearer ".length).trim();
  if (!idToken) return null;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    return decoded.uid ?? null;
  } catch (error) {
    logger.warn("coachChat.http.auth_failed", { message: (error as Error)?.message });
    return null;
  }
}

export const coachChat = onCall<CoachChatRequest>(
  {
    region: "us-central1",
    cors: true,
    enforceAppCheck: false,
  },
  async (request) => {
    const requestId = request.rawRequest?.get("x-request-id")?.trim() || randomUUID();
    await ensureSoftAppCheckFromCallable(request, {
      fn: "coachChat",
      uid: request.auth?.uid ?? null,
      requestId,
    });

    const payload = normalizePayload(request.data);
    if (!payload.message) {
      throw new HttpsError("invalid-argument", "Missing or invalid 'message' field for coach chat.");
    }

    const identifier = identifierFromRequest(request.rawRequest as Request);
    try {
      return await generateCoachResponse(payload, {
        uid: request.auth?.uid ?? null,
        identifier,
        requestId,
      });
    } catch (error) {
      logger.error("coachChat.callable.failed", {
        requestId,
        uid: request.auth?.uid ?? null,
        message: (error as Error)?.message,
      });
      throw toHttpsError(error, requestId);
    }
  },
);

export async function coachChatHandler(req: Request, res: Response): Promise<void> {
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Firebase-AppCheck");
    res.set("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const payload = normalizePayload(req.body);
  if (!payload.message) {
    res.status(400).json({
      code: "invalid-argument",
      message: "Missing or invalid 'message' field for coach chat.",
    });
    return;
  }

  const requestId = req.get("x-request-id")?.trim() || randomUUID();
  const identifier = identifierFromRequest(req);
  const uid = await resolveUidFromRequest(req);
  await ensureSoftAppCheckFromRequest(req, { fn: "coachChat", uid, requestId });

  try {
    const response = await generateCoachResponse(payload, { uid, identifier, requestId });
    res.status(200).json(response);
  } catch (error) {
    const mapped = toHttpsError(error, requestId);
    const debugId = (mapped.details as any)?.debugId ?? requestId;
    res.status(httpStatusFromHttpsError(mapped)).json({
      ok: false,
      code: mapped.code,
      message: mapped.message,
      debugId,
    });
  }
}
