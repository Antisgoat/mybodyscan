import { randomUUID } from "crypto";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "./firebase.js";
import { requireAppCheckStrict } from "./middleware/appCheck.js";
import { withCors } from "./middleware/cors.js";
import { requireAuth } from "./http.js";
const db = getFirestore();
function deterministicPlan(prefs) {
    const focus = prefs.focus || "full";
    const baseExercises = focus === "back"
        ? [
            { id: randomUUID(), name: "Pull Ups", sets: 3, reps: 8 },
            { id: randomUUID(), name: "Bent Over Row", sets: 3, reps: 10 },
            { id: randomUUID(), name: "Face Pull", sets: 3, reps: 12 },
        ]
        : [
            { id: randomUUID(), name: "Goblet Squat", sets: 3, reps: 12 },
            { id: randomUUID(), name: "Reverse Lunge", sets: 3, reps: 10 },
            { id: randomUUID(), name: "Plank", sets: 3, reps: 45 },
        ];
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const limit = Math.max(2, Math.min(prefs.daysPerWeek || 4, 6));
    return days.slice(0, limit).map((day, index) => ({
        day,
        exercises: baseExercises.map((ex, idx) => ({ ...ex, id: `${ex.id}-${index}-${idx}` })),
    }));
}
async function generateAiPlan(prefs) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey)
        return null;
    try {
        const prompt = `Return a JSON array of workout days. Each item must include "day" (Mon-Sun) and an array "exercises" with {"name","sets","reps"}. Focus: ${prefs.focus || "balanced"}. Equipment: ${prefs.equipment || "bodyweight"}. Days per week: ${prefs.daysPerWeek || 4}.`;
        const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                input: prompt,
                temperature: 0.4,
            }),
        });
        if (!response.ok) {
            throw new Error(`openai ${response.status}`);
        }
        const data = await response.json();
        const text = data?.output_text ||
            data?.output?.[0]?.content?.[0]?.text ||
            data?.choices?.[0]?.message?.content ||
            "";
        const jsonStart = text.indexOf("[");
        const jsonEnd = text.lastIndexOf("]");
        if (jsonStart < 0 || jsonEnd < jsonStart) {
            throw new Error("invalid ai response");
        }
        const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
        if (!Array.isArray(parsed))
            throw new Error("invalid plan");
        return parsed
            .filter((item) => typeof item === "object" && item !== null)
            .map((item) => ({
            day: String(item.day || "Mon"),
            exercises: Array.isArray(item.exercises)
                ? item.exercises.map((ex) => ({
                    id: randomUUID(),
                    name: String(ex.name || "Exercise"),
                    sets: Number(ex.sets || 3),
                    reps: Number(ex.reps || 10),
                }))
                : [],
        }));
    }
    catch (err) {
        console.error("generateAiPlan", err);
        return null;
    }
}
async function resolvePlanDays(prefs) {
    const aiPlan = await generateAiPlan(prefs);
    if (aiPlan && aiPlan.length) {
        return { days: aiPlan, source: "openai" };
    }
    return { days: deterministicPlan(prefs), source: "deterministic" };
}
async function persistPlan(uid, prefs) {
    const { days, source } = await resolvePlanDays(prefs);
    const planId = randomUUID();
    const plan = {
        id: planId,
        active: true,
        createdAt: Timestamp.now(),
        prefs,
        days,
    };
    await db.doc(`users/${uid}/workoutPlans/${planId}`).set({
        ...plan,
        source,
    });
    await db.doc(`users/${uid}/workoutPlans_meta`).set({
        activePlanId: planId,
        updatedAt: Timestamp.now(),
    }, { merge: true });
    return { planId, days, source };
}
async function fetchCurrentPlan(uid) {
    const meta = await db.doc(`users/${uid}/workoutPlans_meta`).get();
    const planId = meta.data()?.activePlanId || null;
    if (!planId)
        return null;
    const snap = await db.doc(`users/${uid}/workoutPlans/${planId}`).get();
    if (!snap.exists)
        return null;
    return { id: planId, ...snap.data() };
}
async function handleGenerate(req, res) {
    await requireAppCheckStrict(req, res);
    const uid = await requireAuth(req);
    const prefs = (req.body?.prefs || {});
    const plan = await persistPlan(uid, prefs);
    res.json(plan);
}
async function handleGetPlan(req, res) {
    await requireAppCheckStrict(req, res);
    const uid = await requireAuth(req);
    const plan = await fetchCurrentPlan(uid);
    res.json(plan);
}
async function handleMarkDone(req, res) {
    await requireAppCheckStrict(req, res);
    const uid = await requireAuth(req);
    const body = req.body;
    if (!body.planId || body.dayIndex === undefined || !body.exerciseId || typeof body.done !== "boolean") {
        throw new HttpsError("invalid-argument", "Invalid payload");
    }
    const planSnap = await db.doc(`users/${uid}/workoutPlans/${body.planId}`).get();
    if (!planSnap.exists) {
        throw new HttpsError("not-found", "Plan not found");
    }
    const plan = planSnap.data();
    const day = plan.days?.[body.dayIndex];
    const total = day?.exercises?.length || 0;
    const iso = new Date().toISOString().slice(0, 10);
    const progressRef = db.doc(`users/${uid}/workoutPlans/${body.planId}/progress/${iso}`);
    let ratio = 0;
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(progressRef);
        const completed = snap.exists ? snap.data()?.completed || [] : [];
        const idx = completed.indexOf(body.exerciseId);
        if (body.done && idx < 0) {
            completed.push(body.exerciseId);
        }
        if (!body.done && idx >= 0) {
            completed.splice(idx, 1);
        }
        ratio = total ? completed.length / total : 0;
        tx.set(progressRef, {
            completed,
            updatedAt: Timestamp.now(),
        }, { merge: true });
    });
    res.json({ ratio });
}
async function handleGetWorkouts(req, res) {
    await requireAppCheckStrict(req, res);
    const uid = await requireAuth(req);
    const plan = await fetchCurrentPlan(uid);
    if (!plan) {
        res.json({ planId: null, days: [] });
        return;
    }
    const progressSnap = await db
        .collection(`users/${uid}/workoutPlans/${plan.id}/progress`)
        .orderBy("updatedAt", "desc")
        .limit(14)
        .get();
    const progress = {};
    progressSnap.docs.forEach((doc) => {
        const data = doc.data();
        progress[doc.id] = data.completed || [];
    });
    res.json({ planId: plan.id, days: plan.days, progress });
}
function withHandler(handler) {
    return onRequest({ invoker: "public" }, withCors(async (req, res) => {
        try {
            await requireAppCheckStrict(req, res);
            await handler(req, res);
        }
        catch (err) {
            const code = err instanceof HttpsError ? err.code : "internal";
            const status = code === "unauthenticated"
                ? 401
                : code === "invalid-argument"
                    ? 400
                    : code === "not-found"
                        ? 404
                        : 500;
            res.status(status).json({ error: err.message || "error" });
        }
    }));
}
export const generateWorkoutPlan = withHandler(handleGenerate);
export const generatePlan = generateWorkoutPlan;
export const getPlan = withHandler(handleGetPlan);
export const getCurrentPlan = getPlan;
export const markExerciseDone = withHandler(handleMarkDone);
export const addWorkoutLog = markExerciseDone;
export const getWorkouts = withHandler(handleGetWorkouts);
//# sourceMappingURL=workouts.js.map