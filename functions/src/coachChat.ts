import { randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import { HttpsError, onRequest } from "firebase-functions/v2/https";

import { Timestamp, getAuth, getFirestore } from "./firebase.js";
import { formatCoachReply } from "./coachUtils.js";
import { verifyAppCheck } from "./http.js";
import { ensureRateLimit } from "./http/_middleware.js";
import { openAiSecretParam } from "./lib/config.js";
import { coachChatCollectionPath } from "./lib/paths.js";
import { chatOnce, OpenAIClientError } from "./openai/client.js";
import { HttpError, send } from "./util/http.js";
import { getAppCheckMode, type AppCheckMode } from "./lib/env.js";

const db = getFirestore();
const MAX_TEXT_LENGTH = 800;
const MIN_TEXT_LENGTH = 1;

type AuthDetails = {
  uid: string | null;
};

function normalizeBody(body: unknown): Record<string, unknown> {
  if (!body) {
    return {};
  }
  if (typeof body === "object") {
    return body as Record<string, unknown>;
  }
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore parse errors
    }
  }
  return {};
}

function sanitizeMessage(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new HttpError(400, "invalid_request", "message_required");
  }
  const trimmed = raw.trim();
  if (trimmed.length < MIN_TEXT_LENGTH) {
    throw new HttpError(400, "invalid_request", "message_too_short");
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw new HttpError(400, "invalid_request", "message_too_long");
  }
  return trimmed;
}

function resolveMessage(payload: Record<string, unknown>): string {
  const candidate = payload.message ?? payload.text;
  return sanitizeMessage(candidate);
}

function extractBearerToken(req: Request): string {
  const header = req.get("authorization") || req.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new HttpError(401, "unauthorized", "missing_bearer");
  }
  const token = match[1]?.trim();
  if (!token) {
    throw new HttpError(401, "unauthorized", "missing_bearer");
  }
  return token;
}

async function verifyAuthorization(req: Request): Promise<AuthDetails> {
  const token = extractBearerToken(req);

  try {
    const decoded = await getAuth().verifyIdToken(token);
    return { uid: decoded.uid ?? null };
  } catch (error) {
    const message = (error as { message?: string })?.message ?? String(error);
    const code = (error as { code?: string })?.code ?? "";
    if (
      code === "app/no-app" ||
      code === "app/invalid-credential" ||
      message.includes("credential") ||
      message.includes("initializeApp")
    ) {
      console.warn("no_admin_verify", { reason: message || code || "unknown" });
      return { uid: null };
    }

    console.warn("coach_chat.auth_failed", { message });
    throw new HttpError(401, "unauthorized", "invalid_token");
  }
}

async function ensureAppCheck(req: Request, mode: AppCheckMode): Promise<void> {
  try {
    await verifyAppCheck(req, mode);
  } catch (error: unknown) {
    if (error instanceof HttpsError) {
      const code = error.message === "app_check_invalid" ? "app_check_invalid" : "app_check_required";
      throw new HttpError(401, code);
    }
    throw error;
  }
}

async function storeMessage(uid: string, text: string, response: string): Promise<void> {
  const colRef = db.collection(coachChatCollectionPath(uid));
  const docRef = await colRef.add({
    text,
    response,
    createdAt: Timestamp.now(),
    usedLLM: true,
  });

  const snapshot = await colRef.orderBy("createdAt", "desc").offset(10).get();
  const deletions = snapshot.docs.filter((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.id !== docRef.id);
  await Promise.allSettled(
    deletions.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.ref.delete().catch(() => undefined)),
  );
}

function handleError(res: Response, error: unknown, uid: string | null, requestId: string, started: number): void {
  const ms = Date.now() - started;
  if (error instanceof HttpError) {
    console.warn({ fn: "coachChat", requestId, uid: uid ?? "anonymous", code: error.code, ms, err: error.message });
    const payload: Record<string, unknown> = { error: error.code };
    if (error.message && error.message !== error.code) {
      payload.reason = error.message;
    }
    send(res, error.status, payload);
    return;
  }

  if (error instanceof OpenAIClientError) {
    console.warn({ fn: "coachChat", requestId, uid: uid ?? "anonymous", code: error.code, ms, err: error.message });
    send(res, error.status, { error: error.code });
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.warn({ fn: "coachChat", requestId, uid: uid ?? "anonymous", code: "openai_failed", ms, err: message });
  send(res, 502, { error: "openai_failed" });
}

export const coachChat = onRequest(
  { invoker: "public", region: "us-central1", secrets: [openAiSecretParam] },
  async (req: Request, res: Response) => {
    if (req.method === "OPTIONS") {
      send(res, 204, null);
      return;
    }

    const startedAt = Date.now();
    const requestId = (req.get("x-request-id") || req.get("X-Request-Id") || "").trim() || randomUUID();
    let uid: string | null = null;

    try {
      const appCheckMode = getAppCheckMode();
      await ensureAppCheck(req, appCheckMode);

      if (req.method !== "POST") {
        throw new HttpError(405, "method_not_allowed");
      }

      const auth = await verifyAuthorization(req);
      uid = auth.uid;

      const payload = normalizeBody(req.body);
      const message = resolveMessage(payload);

      const limitResult = await ensureRateLimit({
        key: "coach_chat",
        identifier: uid ?? "anonymous",
        limit: 8,
        windowSeconds: 60,
      });

      if (!limitResult.allowed) {
        console.warn({
          fn: "coachChat",
          requestId,
          uid: uid ?? "anonymous",
          code: "rate_limited",
          ms: Date.now() - startedAt,
          err: "limit_reached",
        });
        send(res, 429, {
          error: "rate_limited",
          retryAfter: limitResult.retryAfterSeconds ?? null,
        });
        return;
      }

      const replyText = await chatOnce(message, { userId: uid ?? undefined, requestId });
      const formatted = formatCoachReply(replyText);

      if (uid) {
        try {
          await storeMessage(uid, message, formatted);
        } catch (error) {
          console.warn({
            fn: "coachChat",
            requestId,
            uid,
            code: "store_failed",
            ms: Date.now() - startedAt,
            err: error instanceof Error ? error.message : String(error),
          });
        }
      }

      console.info({ fn: "coachChat", requestId, uid: uid ?? "anonymous", code: "ok", ms: Date.now() - startedAt });
      send(res, 200, { message: formatted });
    } catch (error) {
      handleError(res, error, uid, requestId, startedAt);
    }
  },
);

