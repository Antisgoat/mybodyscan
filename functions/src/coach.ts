import { randomUUID } from "node:crypto";
import express from "express";
import { FieldValue, getAuth, getFirestore } from "./firebase.js";
import { cors } from "./http.js";
import { chatOnce, OpenAIClientError } from "./openai/client.js";

const db = getFirestore();

async function appendMessage(uid: string, text: string, response: string, demo: boolean): Promise<void> {
  if (!uid) return;
  const collection = db.collection(`users/${uid}/coach/chatMeta/chat`);
  const docRef = await collection.add({
    text,
    response,
    createdAt: FieldValue.serverTimestamp(),
    usedLLM: true,
    demo,
  });

  try {
    const snapshot = await collection.orderBy("createdAt", "desc").offset(20).get();
    await Promise.all(snapshot.docs.filter((doc) => doc.id !== docRef.id).map((doc) => doc.ref.delete()));
  } catch (error) {
    console.warn("coach_trim_failed", { message: (error as Error)?.message });
  }
}

async function optionalUser(req: express.Request) {
  const header = req.get("Authorization") || req.get("authorization") || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice(7).trim();
  if (!token) return null;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      demo: decoded.demo === true,
    };
  } catch (error) {
    const message = (error as Error)?.message ?? "invalid_token";
    throw Object.assign(new Error("unauthenticated"), { status: 401, message });
  }
}

export const coachRouter = express.Router();

coachRouter.use(cors);
coachRouter.use(express.json());

coachRouter.post("/chat", async (req, res) => {
  const questionRaw = req.body?.question;
  const question = typeof questionRaw === "string" ? questionRaw.trim() : "";
  if (!question) {
    res.status(400).json({ error: "missing_question" });
    return;
  }

  let authInfo: { uid?: string; email?: string; demo?: boolean } | null = null;
  try {
    authInfo = await optionalUser(req);
  } catch (error: any) {
    res.status(error?.status === 401 ? 401 : 401).json({ error: "unauthenticated" });
    return;
  }

  const demo = req.body?.demo === true || authInfo?.demo === true;
  const requestId = randomUUID();

  try {
    const openAiUser = demo ? `demo:${authInfo?.uid ?? "guest"}` : authInfo?.uid ?? undefined;
    const answer = await chatOnce(question, {
      userId: openAiUser,
      model: "gpt-4o-mini",
      requestId,
    });
    if (authInfo?.uid && !demo) {
      try {
        await appendMessage(authInfo.uid, question, answer, false);
      } catch (logError) {
        console.warn("coach_log_failed", { requestId, message: (logError as Error)?.message });
      }
    }
    res.json({ answer });
  } catch (error) {
    if (error instanceof OpenAIClientError) {
      const status = [400, 401, 429].includes(error.status) ? error.status : 500;
      res.status(status).json({ error: error.code, message: error.message });
      return;
    }
    console.error("coach_chat_error", {
      message: (error as Error)?.message,
      requestId,
      demo,
    });
    res.status(500).json({ error: "coach_unavailable" });
  }
});
