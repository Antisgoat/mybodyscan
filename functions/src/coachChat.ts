import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { FieldValue, getAuth, getFirestore } from "./firebase.js";
import {
  chatOnce,
  chatWithMessages,
  type OpenAIChatMessage,
  OpenAIClientError,
} from "./openai/client.js";
import { identifierFromRequest } from "./http/_middleware.js";
import {
  ensureSoftAppCheckFromCallable,
  ensureSoftAppCheckFromRequest,
} from "./lib/appCheckSoft.js";
import { scrubUndefined } from "./lib/scrub.js";

export interface CoachChatRequest {
  message: string;
  /** Optional thread support (ChatGPT-style). */
  threadId?: string;
  /** Optional deterministic message id written client-side (for dedupe). */
  messageId?: string;
  goalType?: string;
  goalWeight?: number;
  currentWeight?: number;
  sex?: string;
  age?: number;
  heightCm?: number;
  activityLevel?: string;
}

interface CoachChatMetadata {
  recommendedSplit?: string;
  caloriesPerDay?: number;
  macros?: { protein: number; carbs: number; fat: number };
}

export interface CoachChatResponsePayload {
  reply: string;
  suggestions?: string[];
  threadId?: string;
  assistantMessageId?: string;
  meta?: {
    debugId: string;
    metadata?: CoachChatMetadata;
    model?: string;
    tokens?: number;
  };
}

type RequestContext = {
  uid: string | null;
  identifier: string;
  requestId: string;
};

type ThreadMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt?: FirebaseFirestore.Timestamp | null;
};

const db = getFirestore();
const THREADS_COLLECTION = "coachThreads";

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
  const num =
    typeof value === "string"
      ? Number(value)
      : typeof value === "number"
        ? value
        : NaN;
  return Number.isFinite(num) ? Number(num) : undefined;
}

function normalizePayload(data: unknown): CoachChatRequest {
  const payload = (
    typeof data === "object" && data !== null ? data : {}
  ) as Partial<CoachChatRequest>;
  return {
    message: sanitizeMessage(payload.message),
    threadId:
      typeof payload.threadId === "string" && payload.threadId.trim().length
        ? payload.threadId.trim().slice(0, 120)
        : undefined,
    messageId:
      typeof payload.messageId === "string" && payload.messageId.trim().length
        ? payload.messageId.trim().slice(0, 120)
        : undefined,
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
  if (input.currentWeight)
    context.push(`Current weight: ${input.currentWeight} kg`);
  if (input.goalWeight) context.push(`Goal weight: ${input.goalWeight} kg`);
  if (input.heightCm) context.push(`Height: ${input.heightCm} cm`);
  if (input.sex) context.push(`Sex: ${input.sex}`);
  if (input.age) context.push(`Age: ${input.age}`);
  if (input.activityLevel)
    context.push(`Activity level: ${input.activityLevel}`);

  const lines: string[] = [];
  lines.push(
    "Provide a concise, motivational yet practical answer for the user below."
  );
  if (context.length) {
    lines.push("Context:");
    lines.push(...context);
  }
  lines.push("Question:");
  lines.push(input.message);
  lines.push(
    "Respond in 2-3 short paragraphs max. Prioritize safety, progressive overload, recovery, and nutrition."
  );
  lines.push(
    'After your reply, add a line exactly once: METADATA: {"recommendedSplit":"...", "caloriesPerDay":1234, "macros":{"protein":150,"carbs":200,"fat":60}}. Omit fields instead of guessing wildly.'
  );
  return lines.join("\n");
}

function buildContextLines(input: CoachChatRequest): string[] {
  const context: string[] = [];
  if (input.goalType) context.push(`Goal focus: ${input.goalType}`);
  if (input.currentWeight) context.push(`Current weight: ${input.currentWeight} kg`);
  if (input.goalWeight) context.push(`Goal weight: ${input.goalWeight} kg`);
  if (input.heightCm) context.push(`Height: ${input.heightCm} cm`);
  if (input.sex) context.push(`Sex: ${input.sex}`);
  if (input.age) context.push(`Age: ${input.age}`);
  if (input.activityLevel) context.push(`Activity level: ${input.activityLevel}`);
  return context;
}

function buildThreadUserContent(input: CoachChatRequest): string {
  const lines: string[] = [];
  lines.push("User message:");
  lines.push(input.message);
  const context = buildContextLines(input);
  if (context.length) {
    lines.push("");
    lines.push("Context:");
    lines.push(...context);
  }
  return lines.join("\n").trim();
}

function parseMetadataLine(source: string): {
  replyText: string;
  metadata?: CoachChatMetadata;
} {
  const match = source.match(/(?:^|\n)METADATA:\s*(\{[\s\S]*\})\s*$/i);
  if (!match) {
    return { replyText: source.trim() };
  }
  const metadataRaw = match[1];
  let metadata: CoachChatMetadata | undefined;
  try {
    const parsed = JSON.parse(metadataRaw) as CoachChatMetadata;
    const protein = toNumber(parsed?.macros?.protein);
    const carbs = toNumber(parsed?.macros?.carbs);
    const fat = toNumber(parsed?.macros?.fat);
    metadata = {
      recommendedSplit:
        typeof parsed?.recommendedSplit === "string"
          ? parsed.recommendedSplit
          : undefined,
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
    logger.warn("coachChat.metadata.parse_failed", {
      message: (error as Error)?.message,
    });
  }
  const replyText = source.replace(match[0], "").trim();
  return { replyText: replyText || source.trim(), metadata };
}

function buildSuggestions(metadata?: CoachChatMetadata): string[] | undefined {
  if (!metadata) return undefined;
  const suggestions = new Set<string>();
  if (metadata.recommendedSplit) {
    suggestions.add("Regenerate weekly plan");
  }
  if (
    typeof metadata.caloriesPerDay === "number" &&
    metadata.caloriesPerDay > 0
  ) {
    suggestions.add("Review nutrition targets");
  }
  if (
    metadata.macros &&
    Object.values(metadata.macros).some(
      (value) => typeof value === "number" && value > 0
    )
  ) {
    suggestions.add("Log meals to hit your macros");
  }
  return suggestions.size ? Array.from(suggestions) : undefined;
}

async function generateCoachResponse(
  payload: CoachChatRequest,
  context: RequestContext
): Promise<CoachChatResponsePayload> {
  const prompt = buildPrompt(payload);
  const answer = await chatOnce(prompt, {
    userId: context.uid ?? undefined,
    requestId: context.requestId,
  });
  const { replyText, metadata } = parseMetadataLine(answer);
  return {
    reply: replyText,
    suggestions: buildSuggestions(metadata),
    meta: {
      debugId: context.requestId,
      metadata,
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    },
  };
}

async function loadThreadHistory(uid: string, threadId: string, limitN = 18) {
  const ref = db
    .collection(`users/${uid}/${THREADS_COLLECTION}/${threadId}/messages`)
    .orderBy("createdAt", "desc")
    .limit(Math.max(1, Math.min(limitN, 30)));
  const snap = await ref.get();
  const items: ThreadMessage[] = snap.docs
    .map((doc) => doc.data() as ThreadMessage)
    .filter(
      (msg) =>
        msg &&
        (msg.role === "user" || msg.role === "assistant") &&
        typeof msg.content === "string" &&
        msg.content.trim().length > 0
    );
  return items.reverse();
}

function threadMessagesToOpenAI(
  history: ThreadMessage[],
  nextUserContent: string
): OpenAIChatMessage[] {
  const messages: OpenAIChatMessage[] = [
    {
      role: "system",
      content:
        "You are MyBodyScan's virtual coach. Respond with concise, motivational guidance in under 150 words. Avoid medical advice.\n" +
        'After your reply, add a line exactly once: METADATA: {"recommendedSplit":"...", "caloriesPerDay":1234, "macros":{"protein":150,"carbs":200,"fat":60}}. Omit fields instead of guessing wildly.',
    },
  ];

  history.forEach((msg) => {
    messages.push({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content.trim(),
    });
  });

  messages.push({ role: "user", content: nextUserContent });
  return messages;
}

async function ensureThread(uid: string, threadId: string) {
  const ref = db.doc(`users/${uid}/${THREADS_COLLECTION}/${threadId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    await ref.set(
      scrubUndefined({
        uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        status: "active",
      }),
      { merge: true }
    );
  } else {
    await ref.set(
      // Keep uid present for older threads and always bump updatedAt so the UI can order threads reliably.
      scrubUndefined({ uid, updatedAt: FieldValue.serverTimestamp() }),
      { merge: true }
    );
  }
  return ref;
}

async function upsertUserMessage(params: {
  uid: string;
  threadId: string;
  messageId: string;
  content: string;
}) {
  const ref = db.doc(
    `users/${params.uid}/${THREADS_COLLECTION}/${params.threadId}/messages/${params.messageId}`
  );
  await ref.set(
    scrubUndefined({
      role: "user",
      content: params.content,
      createdAt: FieldValue.serverTimestamp(),
    }),
    { merge: true }
  );
  return ref;
}

async function writeAssistantMessage(params: {
  uid: string;
  threadId: string;
  content: string;
  suggestions?: string[];
  meta: {
    requestId: string;
    model: string;
    tokens?: number;
    metadata?: CoachChatMetadata;
  };
}) {
  const id = randomUUID();
  const ref = db.doc(
    `users/${params.uid}/${THREADS_COLLECTION}/${params.threadId}/messages/${id}`
  );
  await ref.set(
    scrubUndefined({
      role: "assistant",
      content: params.content,
      createdAt: FieldValue.serverTimestamp(),
      suggestions: params.suggestions,
      meta: scrubUndefined({
        debugId: params.meta.requestId,
        model: params.meta.model,
        tokens: params.meta.tokens,
        metadata: params.meta.metadata,
      }),
    }),
    { merge: true }
  );
  return { id, ref };
}

async function generateCoachResponseForThread(
  payload: CoachChatRequest,
  context: RequestContext,
  threadId: string
): Promise<CoachChatResponsePayload> {
  if (!context.uid) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }

  await ensureThread(context.uid, threadId);

  // Load recent history first, then append the current user message content so
  // we don't depend on serverTimestamp propagation for context building.
  const history = await loadThreadHistory(context.uid, threadId, 18);
  const nextUserContent = buildThreadUserContent(payload);
  const messages = threadMessagesToOpenAI(history, nextUserContent);

  const { content, usage, model } = await chatWithMessages(messages, {
    userId: context.uid,
    requestId: context.requestId,
  });
  const { replyText, metadata } = parseMetadataLine(content);

  const userMessageId = payload.messageId?.trim() || randomUUID();
  await upsertUserMessage({
    uid: context.uid,
    threadId,
    messageId: userMessageId,
    content: payload.message,
  });

  const assistant = await writeAssistantMessage({
    uid: context.uid,
    threadId,
    content: replyText,
    suggestions: buildSuggestions(metadata),
    meta: {
      requestId: context.requestId,
      model,
      tokens:
        (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0) || undefined,
      metadata,
    },
  });

  await db.doc(`users/${context.uid}/${THREADS_COLLECTION}/${threadId}`).set(
    scrubUndefined({
      uid: context.uid,
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
      lastMessagePreview: replyText.slice(0, 140),
    }),
    { merge: true }
  );

  return {
    reply: replyText,
    suggestions: buildSuggestions(metadata),
    threadId,
    assistantMessageId: assistant.id,
    meta: {
      debugId: context.requestId,
      metadata,
      model,
      tokens:
        (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0) || undefined,
    },
  };
}

function getHttpsErrorDetails(error: HttpsError): any {
  return (error as { details?: any }).details;
}

function toHttpsError(error: unknown, debugId: string): HttpsError {
  const attachDetails = (details?: any) =>
    typeof details === "object" && details !== null
      ? { ...details, debugId }
      : { debugId };

  if (error instanceof HttpsError) {
    return new HttpsError(
      error.code,
      error.message,
      attachDetails(getHttpsErrorDetails(error))
    );
  }
  if (error instanceof OpenAIClientError) {
    if (error.code === "openai_missing_key") {
      return new HttpsError(
        "failed-precondition",
        "Coach is not configured. Please try again later.",
        {
          debugId,
          reason: error.code,
        }
      );
    }
    return new HttpsError(
      "unavailable",
      "Coach is temporarily unavailable. Please try again.",
      {
        debugId,
        reason: error.code,
      }
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new HttpsError(
    "internal",
    "Coach is temporarily unavailable. Please try again.",
    {
      debugId,
      reason: message || "unknown_error",
    }
  );
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
    logger.warn("coachChat.http.auth_failed", {
      message: (error as Error)?.message,
    });
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
    const requestId =
      request.rawRequest?.get("x-request-id")?.trim() || randomUUID();
    await ensureSoftAppCheckFromCallable(request, {
      fn: "coachChat",
      uid: request.auth?.uid ?? null,
      requestId,
    });

    const payload = normalizePayload(request.data);
    if (!payload.message) {
      throw new HttpsError(
        "invalid-argument",
        "Missing or invalid 'message' field for coach chat."
      );
    }

    const identifier = identifierFromRequest(request.rawRequest as Request);
    try {
      const ctx: RequestContext = {
        uid: request.auth?.uid ?? null,
        identifier,
        requestId,
      };
      if (payload.threadId) {
        return await generateCoachResponseForThread(payload, ctx, payload.threadId);
      }
      return await generateCoachResponse(payload, ctx);
    } catch (error) {
      logger.error("coachChat.callable.failed", {
        requestId,
        uid: request.auth?.uid ?? null,
        message: (error as Error)?.message,
      });
      throw toHttpsError(error, requestId);
    }
  }
);

export async function coachChatHandler(
  req: Request,
  res: Response
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.set("Access-Control-Allow-Origin", "*");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Firebase-AppCheck"
    );
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
    const ctx: RequestContext = { uid, identifier, requestId };
    const response = payload.threadId
      ? await generateCoachResponseForThread(payload, ctx, payload.threadId)
      : await generateCoachResponse(payload, ctx);
    res.status(200).json(response);
  } catch (error) {
    const mapped = toHttpsError(error, requestId);
    const mappedDetails = getHttpsErrorDetails(mapped) ?? {};
    const debugId = mappedDetails?.debugId ?? requestId;
    res.status(httpStatusFromHttpsError(mapped)).json({
      code: mapped.code,
      message: mapped.message,
      debugId,
    });
  }
}
