import * as functions from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import OpenAI from "openai";

import { getFirestore, FieldValue } from "./firebase.js";
import { coachChatCollectionPath } from "./lib/paths.js";
import { uidFromBearer } from "./util/auth.js";

const corsOrigins = [
  "https://mybodyscanapp.com",
  "https://www.mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
];
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
const db = getFirestore();
const OPENAI_TIMEOUT_MS = 8000;

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

async function createReply(message: string, uid: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("coach_unconfigured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: "You are MyBodyScan's AI Coach. Be brief, specific, and safe." },
        { role: "user", content: message },
      ],
      user: uid,
      signal: controller.signal,
    });

    const reply = response.choices?.[0]?.message?.content?.trim();
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

export const coachChat = functions.onRequest({ region: "us-central1", cors: corsOrigins }, async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.status(405).send("Method not allowed");
      return;
    }

    const uid = await uidFromBearer(req);
    if (!uid) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    const message = normalizeMessage(req.body);
    if (!message) {
      res.status(400).json({ error: "bad_request" });
      return;
    }

    const reply = await createReply(message, uid);
    await storeMessage(uid, message, reply);

    res.json({ reply });
  } catch (error: any) {
    if (error?.message === "coach_unconfigured") {
      res.status(503).json({ error: "TEMP_UNAVAILABLE" });
      return;
    }
    if (error?.message === "coach_timeout") {
      res.status(503).json({ error: "TEMP_UNAVAILABLE" });
      return;
    }
    logger.error("coachChat error", error);
    res.status(503).json({ error: "TEMP_UNAVAILABLE" });
  }
});
