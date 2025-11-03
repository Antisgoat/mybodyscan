import { onCallWithOptionalAppCheck } from "../util/callable.js";
import { HttpsError } from "firebase-functions/v2/https";
import OpenAI from "openai";
import * as logger from "firebase-functions/logger";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export const coachChat = onCallWithOptionalAppCheck(async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const message = String(req.data?.message || "").trim();
  if (!message) throw new HttpsError("invalid-argument", "message required");

  try {
    const chat = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a friendly yet precise fitness coach. Give actionable, safe suggestions. If pain is mentioned, include form/regression and ‘consider seeing a professional if pain persists.’",
        },
        { role: "user", content: message },
      ],
      temperature: 0.4,
    });
    const text = chat.choices?.[0]?.message?.content ?? "No answer.";
    return { text };
  } catch (error: any) {
    logger.error("coachChat error", error);
    throw new HttpsError("unknown", error?.message || "Coach unavailable.");
  }
});
