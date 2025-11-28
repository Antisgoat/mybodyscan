import * as functions from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { appCheckSoft } from "./http/appCheckSoft.js";
import OpenAI from "openai";

import { getFirestore, FieldValue } from "./firebase.js";
import { coachChatCollectionPath } from "./lib/paths.js";
import { uidFromBearer } from "./util/auth.js";

const allowOrigins = [
  "https://mybodyscanapp.com",
  "https://mybodyscan-f3daf.web.app",
  "https://mybodyscan-f3daf.firebaseapp.com",
  "https://www.mybodyscanapp.com",
];

function cors(req: functions.Request, res: functions.Response): boolean {
  const origin = req.headers.origin || "";
  if (allowOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
    res.set("Access-Control-Allow-Credentials", "true");
    res.set("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Firebase-AppCheck");
    res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return true;
  }
  return false;
}
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
const db = getFirestore();
const OPENAI_TIMEOUT_MS = 8000;
const MAX_HISTORY = 8;
const MAX_MESSAGE_LENGTH = 1200;

function normalizeMessage(body: unknown): { message: string; history: Array<{ role: "user" | "assistant"; content: string }>; profile?: Record<string, unknown> } {
  if (!body || typeof body !== "object") {
    return { message: "", history: [] };
  }
  const payload = body as Record<string, unknown>;
  const rawMessage = typeof payload.message === "string"
    ? payload.message
    : typeof payload.text === "string"
      ? payload.text
      : "";
  const message = rawMessage.trim().slice(0, MAX_MESSAGE_LENGTH);

  const history = Array.isArray(payload.history)
    ? payload.history
        .slice(-MAX_HISTORY)
        .map((entry: any) => ({ role: entry?.role, content: typeof entry?.content === "string" ? entry.content.trim() : "" }))
        .filter((entry) => (entry.role === "user" || entry.role === "assistant") && entry.content)
    : [];

  const profile = typeof payload.profile === "object" && payload.profile !== null ? (payload.profile as Record<string, unknown>) : undefined;

  return { message, history, profile };
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

async function createReply(payload: { message: string; history: Array<{ role: "user" | "assistant"; content: string }>; profile?: Record<string, unknown> }, uid: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("coach_unconfigured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  const systemPrompt = [
    "You are MyBodyScan's AI coach for fitness and nutrition.",
    "Give concise, actionable advice and avoid medical diagnoses.",
    "Consider the user's stated goals, recent scan results, or meals if mentioned.",
    "Be supportive and practical. Keep responses to a few sentences.",
  ].join(" \n");

  const userContext = payload.profile ? `User profile: ${JSON.stringify(payload.profile).slice(0, 600)}` : "";

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: systemPrompt },
        ...payload.history.map((h) => ({ role: h.role, content: h.content })),
        { role: "user", content: [payload.message, userContext].filter(Boolean).join("\n\n") },
      ],
      user: uid,
      signal: controller.signal,
      max_tokens: 320,
    } as any);

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

export const coachChat = functions.onRequest({ region: "us-central1" }, async (req, res) => {
  if (cors(req, res)) return;
  await appCheckSoft(req);
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "method_not_allowed" });
      return;
    }

    const uid = await uidFromBearer(req);
    if (!uid) {
      res.status(401).json({ error: "unauthenticated" });
      return;
    }

    const parsed = normalizeMessage(req.body);
    if (!parsed.message) {
      res.status(400).json({ error: "bad_request" });
      return;
    }

    const reply = await createReply(parsed, uid);
    await storeMessage(uid, parsed.message, reply);

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
