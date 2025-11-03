import { onRequest, type Request } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";

import { getAuth, getFirestore, FieldValue } from "./firebase.js";
import { coachChatCollectionPath } from "./lib/paths.js";

const ALLOWED_ORIGINS = [
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
];

const openaiKey = process.env.OPENAI_API_KEY || "";
const db = getFirestore();
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_TIMEOUT_MS = 8000;

async function requireUid(req: Request): Promise<string> {
  const header = (req.headers["authorization"] || req.headers["Authorization"]) as string | undefined;
  if (!header || !header.startsWith("Bearer ")) {
    throw new Error("unauthenticated");
  }
  const token = header.slice(7).trim();
  if (!token) {
    throw new Error("unauthenticated");
  }
  const decoded = await getAuth().verifyIdToken(token);
  if (!decoded?.uid) {
    throw new Error("unauthenticated");
  }
  return decoded.uid;
}

function normalizeMessage(body: unknown): string {
  if (!body) return "";
  if (typeof body === "string") {
    try {
      const parsed = JSON.parse(body);
      return normalizeMessage(parsed);
    } catch {
      return body.trim();
    }
  }
  if (typeof body === "object") {
    const payload = body as Record<string, unknown>;
    const message = payload.message ?? payload.text;
    if (typeof message === "string") {
      return message.trim();
    }
  }
  return "";
}

async function storeMessage(uid: string, text: string, reply: string): Promise<void> {
  const path = coachChatCollectionPath(uid);
  const collection = db.collection(path);
  const docRef = await collection.add({
    text,
    response: reply,
    createdAt: FieldValue.serverTimestamp(),
    usedLLM: true,
  });

  try {
    const snapshot = await collection.orderBy("createdAt", "desc").offset(10).get();
    const removals = snapshot.docs.filter(
      (doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.id !== docRef.id,
    );
    await Promise.all(
      removals.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => doc.ref.delete().catch(() => undefined)),
    );
  } catch (error) {
    logger.warn("coachChat.cleanup_failed", error as Error);
  }
}

async function generateReply(message: string, uid: string): Promise<string> {
  if (!openaiKey) {
    throw new Error("coach_unconfigured");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.4,
        user: uid,
        messages: [
          {
            role: "system",
            content:
              "You are MyBodyScan's AI Coach. Provide concise, encouraging guidance grounded in safe fitness and nutrition best practices. Avoid medical advice and flag injuries to seek professional care.",
          },
          { role: "user", content: message },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn("coachChat.openai_non_ok", { status: response.status, body: text.slice(0, 120) });
      throw new Error("coach_upstream_error");
    }

    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      throw new Error("coach_empty_reply");
    }
    return reply;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error("coach_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const coachChat = onRequest({ region: "us-central1", cors: ALLOWED_ORIGINS }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method not allowed");
    return;
  }

  try {
    const uid = await requireUid(req);
    const message = normalizeMessage(req.body);
    if (!message) {
      res.status(400).json({ error: "bad_request" });
      return;
    }

    const reply = await generateReply(message, uid);
    await storeMessage(uid, message, reply);

    res.json({ reply });
  } catch (error: any) {
    if (error?.message === "unauthenticated") {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }
    if (error?.message === "coach_unconfigured") {
      res.status(503).json({ error: "TEMP_UNAVAILABLE" });
      return;
    }
    if (error?.message === "coach_timeout") {
      res.status(503).json({ error: "TEMP_UNAVAILABLE" });
      return;
    }
    logger.error("coachChat.error", error);
    res.status(503).json({ error: "TEMP_UNAVAILABLE" });
  }
});
