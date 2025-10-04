import { onRequest, HttpsError } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "./firebase.js";
import { requireAuth } from "./http.js";
import { withCors } from "./middleware/cors.js";
import { enforceRateLimit } from "./middleware/rateLimit.js";
import { verifyAppCheckFromHeader } from "./appCheck.js";
import { verifyRateLimit } from "./rateLimit.js";
import { formatCoachReply } from "./coachUtils.js";
const db = getFirestore();
const MAX_TEXT_LENGTH = 800;
const MIN_TEXT_LENGTH = 1;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_COUNT = 30;
const SYSTEM_PROMPT = "You are a fitness coach. Provide safe, non-medical workout & nutrition suggestions in 120–160 words, using sets×reps and RPE ranges. Consider goals, time available, and experience.";
const OPENAI_MODELS = ["gpt-4o-mini", "gpt-3.5-turbo"];
function sanitizeInput(raw) {
    if (typeof raw !== "string") {
        throw new HttpsError("invalid-argument", "text must be a string");
    }
    const trimmed = raw.trim();
    if (trimmed.length < MIN_TEXT_LENGTH || trimmed.length > MAX_TEXT_LENGTH) {
        throw new HttpsError("invalid-argument", "text must be 1-800 characters");
    }
    return trimmed;
}
function buildFallbackResponse(text) {
    const lower = text.toLowerCase();
    const needsRecovery = lower.includes("sore") || lower.includes("sleep") || lower.includes("tired") || lower.includes("ache");
    if (needsRecovery) {
        return [
            "Let's treat today as a recovery-focused reset so you can push harder later.",
            "Start with 10 minutes of easy cardio at RPE 4-5 to raise body temperature, then move into three mobility blocks:",
            "• Thoracic opener: 2×12 cat-cows and 2×30s child's pose with reaches.",
            "• Lower-body flow: 2×10 walking lunges with a slow return, followed by 2×30s couch stretch per leg.",
            "• Core stability: 3×30s dead bugs and 3×12 bird-dogs at RPE 5.",
            "Finish with light foam rolling on quads, glutes, and lats plus a 5 minute nasal-breathing walk.",
            "Keep protein high (~0.8g per lb) and add a colorful carb + lean protein meal within two hours.",
            "Hydrate with 16-20 oz water and aim for 8-9 hours of sleep tonight. Not medical advice, just smart recovery guidance."
        ].join(" ");
    }
    const splitPlan = lower.includes("time") || lower.includes("busy") ? "upper/lower" : "push/pull/legs";
    const sessions = splitPlan === "upper/lower"
        ? [
            "Day 1 Upper: Bench Press 3×8 @ RPE 7, One-Arm Row 3×10 @ RPE 7, Arnold Press 3×10 @ RPE 7-8, Incline Push-Ups 2×12 @ RPE 6, Face Pulls 2×15 @ RPE 6.",
            "Day 2 Lower: Back Squat 4×6 @ RPE 7-8, Romanian Deadlift 3×8 @ RPE 7, Walking Lunges 3×12/leg @ RPE 7, Seated Calf Raises 3×15 @ RPE 6, Hanging Knee Raises 3×12 @ RPE 6.",
            "Day 3 Upper Repeat: Weighted Chin-Ups 4×6 @ RPE 8, DB Incline Press 3×10 @ RPE 7, Cable Row 3×12 @ RPE 7, Lateral Raise 3×15 @ RPE 6, Farmer Carry 3×40m @ RPE 7.",
            "Day 4 Lower Repeat: Trap Bar Deadlift 3×6 @ RPE 8, Split Squat 3×10/leg @ RPE 7, Leg Curl 3×12 @ RPE 7, Glute Bridge 3×15 @ RPE 6, Plank 3×45s @ RPE 6."
        ]
        : [
            "Day 1 Push: Flat Bench 4×6 @ RPE 8, Incline DB Press 3×10 @ RPE 7, Overhead Press 3×8 @ RPE 7, Cable Fly 2×15 @ RPE 6, Tricep Rope Pushdown 3×12 @ RPE 6.",
            "Day 2 Pull: Deadlift 3×5 @ RPE 8, Chest-Supported Row 3×10 @ RPE 7, Lat Pulldown 3×12 @ RPE 7, Rear-Delt Fly 3×15 @ RPE 6, Barbell Curl 3×12 @ RPE 6.",
            "Day 3 Legs: Back Squat 4×6 @ RPE 8, Bulgarian Split Squat 3×10/leg @ RPE 7, Romanian Deadlift 3×10 @ RPE 7, Leg Press 2×15 @ RPE 6, Standing Calf Raise 3×15 @ RPE 6.",
            "Day 4 Optional Conditioning: 20 minute incline walk at RPE 6, then 3 rounds of kettlebell swings 12 reps @ RPE 7 and plank 45s @ RPE 6."
        ];
    const nutrition = "Aim for 0.8-1.0g protein per lb, build plates around lean protein + veggies + complex carbs, and keep hydration steady (at least 90 oz water).";
    const closer = "Stick with a steady RPE ramp across the week, deload every 4 weeks, and adjust volume based on how you recover. All guidance is educational only and not medical advice.";
    return ["Here's a focused " + splitPlan + " split for the next week:", ...sessions, nutrition, closer].join(" ");
}
async function callOpenAi(model, text) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        throw new HttpsError("failed-precondition", "openai_disabled");
    }
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature: 0.6,
            max_tokens: 320,
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                { role: "user", content: text },
            ],
        }),
    });
    if (!response.ok) {
        const error = await response.text();
        console.error("coach_chat_openai_error", { status: response.status, body: error.slice(0, 200) });
        throw new HttpsError("unavailable", "openai_failed");
    }
    const payload = (await response.json());
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
        console.error("coach_chat_openai_missing_content", { payload });
        throw new HttpsError("internal", "openai_no_content");
    }
    return content.trim();
}
async function storeMessage(uid, record) {
    const colRef = db.collection(`users/${uid}/coach/chat`);
    const docRef = await colRef.add(record);
    const snapshot = await colRef
        .orderBy("createdAt", "desc")
        .offset(10)
        .get();
    const deletions = snapshot.docs.filter((doc) => doc.id !== docRef.id);
    await Promise.allSettled(deletions.map((doc) => doc.ref.delete().catch(() => undefined)));
}
async function handleChat(req, res) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "method_not_allowed" });
        return;
    }
    const uid = await requireAuth(req);
    req.auth = { uid };
    const text = sanitizeInput(req.body?.text ?? req.body?.message);
    try {
        await verifyRateLimit(req, {
            key: "coach",
            max: Number(process.env.COACH_RPM || 6),
            windowSeconds: 60,
        });
    }
    catch (error) {
        if (error?.status === 429) {
            res.status(429).json({ error: "Too Many Requests" });
            return;
        }
        throw error;
    }
    await enforceRateLimit({ uid, key: "coach_chat", limit: RATE_LIMIT_COUNT, windowMs: RATE_LIMIT_WINDOW_MS });
    let responseText = "";
    let usedLLM = false;
    if (process.env.OPENAI_API_KEY) {
        for (const model of OPENAI_MODELS) {
            try {
                responseText = await callOpenAi(model, text);
                usedLLM = true;
                break;
            }
            catch (err) {
                if (err?.code === "failed-precondition") {
                    break;
                }
                console.warn("coach_chat_model_error", { model, message: err?.message });
            }
        }
    }
    if (!responseText) {
        responseText = buildFallbackResponse(text);
        usedLLM = false;
    }
    const reply = formatCoachReply(responseText);
    const record = {
        text,
        response: reply,
        createdAt: Timestamp.now(),
        usedLLM,
    };
    await storeMessage(uid, record);
    res.status(200).json({ reply, usedLLM });
}
export const coachChat = onRequest({ invoker: "public", region: "us-central1" }, withCors(async (req, res) => {
    try {
        await verifyAppCheckFromHeader(req);
    }
    catch (error) {
        if (!res.headersSent) {
            console.warn("coach_chat_appcheck_rejected", { message: error?.message });
            const status = typeof error?.status === "number" ? error.status : 401;
            res.status(status).json({ error: error?.message ?? "app_check_required" });
        }
        return;
    }
    try {
        await handleChat(req, res);
    }
    catch (err) {
        if (res.headersSent)
            return;
        if (err instanceof HttpsError) {
            const statusMap = {
                "invalid-argument": 400,
                "unauthenticated": 401,
                "permission-denied": 403,
                "failed-precondition": 503,
                "resource-exhausted": 429,
                unavailable: 503,
            };
            const status = statusMap[err.code] ?? 500;
            res.status(status).json({ error: err.message, code: err.code });
            return;
        }
        if (typeof err?.status === "number") {
            res.status(err.status).json({ error: err.message ?? "request_failed" });
            return;
        }
        console.error("coach_chat_unhandled", { message: err?.message });
        res.status(500).json({ error: "server_error" });
    }
}));
//# sourceMappingURL=coachChat.js.map