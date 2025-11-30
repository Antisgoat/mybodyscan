import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "./firebase.js";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "",
});

export interface CoachChatRequest {
  message: string;
  goal?: string;
  sex?: string;
  age?: number;
  currentWeightKg?: number;
  targetWeightKg?: number;
  heightCm?: number;
}

export interface CoachChatResponse {
  reply: string;
  uid?: string | null;
}

export async function coachChatHandler(req: Request, res: Response): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const payload = (req.body ?? {}) as Partial<CoachChatRequest>;
  const message = (payload.message ?? "").toString().trim();

  if (!message) {
    res.status(400).json({
      code: "invalid_message",
      message: "Message must not be empty.",
    });
    return;
  }

  try {
    const authHeader = req.headers.authorization ?? "";
    const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";

    let uid: string | null = null;
    if (idToken) {
      try {
        const decoded = await getAuth().verifyIdToken(idToken);
        uid = decoded.uid ?? null;
      } catch {
        // Treat as anonymous; do not fail the request.
      }
    }

    const contextLines: string[] = [];
    if (payload.goal) contextLines.push(`Goal: ${payload.goal}`);
    if (payload.sex) contextLines.push(`Sex: ${payload.sex}`);
    if (payload.age) contextLines.push(`Age: ${payload.age}`);
    if (payload.currentWeightKg) contextLines.push(`Current weight: ${payload.currentWeightKg} kg`);
    if (payload.targetWeightKg) contextLines.push(`Target weight: ${payload.targetWeightKg} kg`);
    if (payload.heightCm) contextLines.push(`Height: ${payload.heightCm} cm`);

    const context = contextLines.join("\n");

    const chatMessages = [
      {
        role: "system" as const,
        content:
          "You are MyBodyScan's AI fitness coach. You create practical workout and diet plans based on the user's current body, goals, and constraints. Be specific, actionable, and safety-conscious.",
      },
      context
        ? {
            role: "system" as const,
            content: `User context:\n${context}`,
          }
        : null,
      { role: "user" as const, content: message },
    ].filter(Boolean) as { role: "system" | "user"; content: string }[];

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_ID || "gpt-4o-mini",
      messages: chatMessages,
    });

    const reply =
      completion.choices[0]?.message?.content?.toString().trim() ||
      "I’m having trouble generating a response right now. Please try again.";

    res.status(200).json({
      reply,
      uid,
    } satisfies CoachChatResponse);
  } catch (error) {
    console.error("coachChat backend error", { error });
    res.status(503).json({
      code: "coach_backend_error",
      message: "Coach is temporarily unavailable; please try again.",
    });
  }
}

export const coachChat = onRequest({ region: "us-central1" }, coachChatHandler);
