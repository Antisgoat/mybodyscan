import { onRequest, HttpsError, type Request } from "firebase-functions/v2/https";
import { softVerifyAppCheck } from "./middleware/appCheck.js";
import { requireAuth, verifyAppCheckSoft } from "./http.js";
import { enforceRateLimit } from "./middleware/rateLimit.js";
import { getFirestore, FieldValue } from "./firebase.js";

interface ChatContext {
  goal?: string;
  equipment?: string[];
  daysPerWeek?: number;
  sleep?: number;
  stress?: "low" | "medium" | "high" | string;
  timeAvailable?: number;
}

interface CombinedContext extends ChatContext {
  programTitle?: string;
}

interface PlanDoc {
  goal?: string;
  equipment?: string[];
  daysPerWeek?: number;
  programId?: string;
  programTitle?: string;
  currentWeekIdx?: number;
  currentDayIdx?: number;
  lastCompletedWeekIdx?: number;
  lastCompletedDayIdx?: number;
  startedAt?: string;
}

const SYSTEM_PROMPT =
  "You are a fitness coach. Provide non-medical, actionable daily guidance using concise sets×reps/RPE. Respect user goal/equipment/time. Keep to ~120–160 words. Avoid medical claims.";

function readBody(req: Request): { text?: unknown; context?: ChatContext } {
  if (!req.body) {
    return {};
  }
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body as { text?: unknown; context?: ChatContext };
}

function sanitizeText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function sanitizeContext(raw?: ChatContext, plan?: PlanDoc | null): CombinedContext {
  const base: CombinedContext = {};
  if (plan?.goal && !base.goal) base.goal = plan.goal;
  if (plan?.equipment?.length) base.equipment = plan.equipment;
  if (typeof plan?.daysPerWeek === "number") base.daysPerWeek = plan.daysPerWeek;
  if (plan?.programTitle) base.programTitle = plan.programTitle;
  const ctx = raw ?? {};
  if (ctx.goal) base.goal = ctx.goal;
  if (Array.isArray(ctx.equipment) && ctx.equipment.length) base.equipment = ctx.equipment;
  if (typeof ctx.daysPerWeek === "number") base.daysPerWeek = ctx.daysPerWeek;
  if (typeof ctx.sleep === "number") base.sleep = ctx.sleep;
  if (ctx.stress) base.stress = ctx.stress;
  if (typeof (ctx as any).timeAvailable === "number") {
    base.timeAvailable = (ctx as any).timeAvailable;
  }
  return base;
}

function buildUserPrompt(text: string, context: CombinedContext): string {
  const lines: string[] = [];
  lines.push(`User request: ${text}`);
  const ctxLines: string[] = [];
  if (context.goal) ctxLines.push(`Goal: ${context.goal}`);
  if (context.programTitle) ctxLines.push(`Program: ${context.programTitle}`);
  if (context.daysPerWeek) ctxLines.push(`Days/Week: ${context.daysPerWeek}`);
  if (context.timeAvailable) ctxLines.push(`Time available: ${context.timeAvailable} min`);
  if (context.equipment?.length) ctxLines.push(`Equipment: ${context.equipment.join(", ")}`);
  if (typeof context.sleep === "number") ctxLines.push(`Sleep last night: ${context.sleep} hrs`);
  if (context.stress) ctxLines.push(`Stress: ${context.stress}`);
  if (ctxLines.length) {
    lines.push("Context:");
    ctxLines.forEach((entry) => lines.push(`- ${entry}`));
  }
  lines.push("Respond using 2-4 bullet points starting with '•' followed by a single recovery line that begins with 'Recovery:'");
  return lines.join("\n");
}

function ruleBasedResponse(text: string, context: CombinedContext): string {
  const normalized = text.toLowerCase();
  const sore = normalized.includes("sore");
  const fatigue = normalized.includes("tired") || normalized.includes("fatigued");
  const poorSleep = typeof context.sleep === "number" && context.sleep < 6;
  const highStress = typeof context.stress === "string" && context.stress.toLowerCase().includes("high");

  const bullets: string[] = [];

  if (sore || fatigue || poorSleep || highStress) {
    bullets.push("• Focus on low-impact movement: 20 min incline walk or easy spin to drive blood flow.");
    bullets.push("• Add 2 rounds of controlled mobility (world's greatest stretch, thoracic openers) for 8-10 reps each.");
    bullets.push("• Finish with core stability (2×12 dead bugs, 2×12 side planks per side at RPE 6).");
    return `${bullets.join("\n")}\n\nRecovery: Prioritize protein with 2-3 balanced meals, hydrate, and aim for an extra 30-45 min of sleep tonight.`;
  }

  const goal = context.goal?.toLowerCase() ?? "hypertrophy";
  const days = context.daysPerWeek ?? 4;
  const equipment = context.equipment?.join(", ") ?? "bodyweight";
  const strengthTemplate = goal.includes("strength") || goal.includes("power");

  if (strengthTemplate) {
    bullets.push("• Main lift: 4×4 back squat or closest alternative at RPE 7.5 with 2-3 min rest.");
    bullets.push("• Pull focus: 3×5 weighted chin-ups (or band-assisted) at RPE 8, superset with 3×12 face pulls.");
    bullets.push("• Accessory: 3×10 single-leg RDL + 3×12 Copenhagen plank per side, RPE 7.");
    return `${bullets.join("\n")}\n\nRecovery: Cool down with 5 min easy cardio, stretch hips, and refuel within 45 min with 30g protein.`;
  }

  const hypertrophyLines = days >= 4
    ? [
        "• Push focus: 3×10 incline press + 3×12 cable fly (or band fly) at RPE 8.",
        "• Pull focus: 4×12 lat pulldown or inverted row, superset with 3×15 rear delt raises.",
        "• Finisher: 3×12 walking lunges each leg + 3×15 calf raises at RPE 8.",
      ]
    : [
        "• Full-body circuit: 3 rounds of goblet squat, push-up, and bent-over row (12 reps each at RPE 7).",
        "• Unilateral work: 3×12 Bulgarian split squats + 3×12 single-arm overhead press at RPE 8.",
        "• Core: 3×15 cable chops or slow mountain climbers focusing on control.",
      ];

  bullets.push(...hypertrophyLines);
  return `${bullets.join("\n")}\n\nRecovery: Light stretch for quads/lats and keep hydration steady (~0.5 oz per lb bodyweight).`;
}

async function callOpenAI(key: string, text: string, context: CombinedContext) {
  const body = {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(text, context) },
    ],
    temperature: 0.7,
    max_tokens: 400,
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });

  if (response.ok) {
    const json = (await response.json()) as any;
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content === "string" && content.trim()) {
      return content.trim();
    }
  }

  if (response.status === 404) {
    const fallbackBody = { ...body, model: "gpt-3.5-turbo" };
    const retry = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(fallbackBody),
      signal: AbortSignal.timeout(8000),
    });
    if (retry.ok) {
      const json = (await retry.json()) as any;
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim()) {
        return content.trim();
      }
    } else {
      throw new Error(`openai_retry_${retry.status}`);
    }
  } else {
    throw new Error(`openai_${response.status}`);
  }

  throw new Error("openai_no_content");
}

function statusForHttpsError(error: HttpsError): number {
  switch (error.code) {
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    case "invalid-argument":
      return 400;
    case "failed-precondition":
      return 412;
    case "resource-exhausted":
      return 429;
    default:
      return 400;
  }
}

export const coachChat = onRequest({
  region: "us-central1",
  invoker: "public",
  concurrency: 20,
  secrets: ["OPENAI_API_KEY"],
}, async (req, res) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Firebase-AppCheck",
  };

  res.set(corsHeaders);

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  if (req.method !== "POST") {
    res.status(200).json({ messages: [], suggestions: [] });
    return;
  }

  try {
    await softVerifyAppCheck(req as any, res as any);
    await verifyAppCheckSoft(req);
    const uid = await requireAuth(req);
    await enforceRateLimit({ uid, key: "coach_chat", limit: 60, windowMs: 60 * 60 * 1000 });

    const payload = readBody(req);
    const text = sanitizeText(payload.text);
    if (!text || text.length > 800) {
      throw new HttpsError("invalid-argument", "Text must be 1-800 characters.");
    }

    const db = getFirestore();
    let plan: PlanDoc | null = null;
    try {
      const planSnap = await db.collection("users").doc(uid).collection("coach").doc("plan").get();
      if (planSnap.exists) {
        plan = planSnap.data() as PlanDoc;
      }
    } catch (error) {
      console.error("coachChat.plan_fetch_error", { uid, error: (error as Error)?.message });
    }

    const context = sanitizeContext(payload.context, plan);
    const apiKey = process.env.OPENAI_API_KEY || "";
    let responseText: string;
    let usedLLM = false;

    if (apiKey) {
      try {
        responseText = await callOpenAI(apiKey, text, context);
        usedLLM = true;
      } catch (error) {
        console.error("coachChat.llm_error", {
          uid,
          message: (error as Error)?.message,
        });
        responseText = ruleBasedResponse(text, context);
      }
    } else {
      responseText = ruleBasedResponse(text, context);
    }

    try {
      await db.collection("users").doc(uid).collection("coachChats").add({
        text,
        response: responseText,
        createdAt: FieldValue.serverTimestamp(),
        usedLLM,
        context,
      });
    } catch (error) {
      console.error("coachChat.log_error", { uid, error: (error as Error)?.message });
    }

    const suggestions = [
      "How should I adjust today if I'm short on time?",
      "What can I add for extra core work?",
      "How do I recover better after heavy lower body?",
    ];

    res.status(200).json({
      messages: [
        {
          role: "assistant",
          text: responseText,
        },
      ],
      suggestions,
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      res.status(statusForHttpsError(error)).json({
        error: {
          code: error.code,
          message: error.message,
        },
        messages: [],
      });
      return;
    }
    console.error("coachChat.unhandled", { message: (error as Error)?.message });
    res.status(500).json({
      error: {
        code: "internal",
        message: "Unable to generate response",
      },
      messages: [],
    });
  }
});
