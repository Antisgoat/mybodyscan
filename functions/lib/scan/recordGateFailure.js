import { HttpsError, onRequest } from "firebase-functions/v2/https";
import { Timestamp, getFirestore } from "../firebase.js";
import { withCors } from "../middleware/cors.js";
import { requireAppCheckStrict } from "../middleware/appCheck.js";
import { requireAuth } from "../http.js";
const db = getFirestore();
const MAX_DAILY_FAILS = 3;
function todayKey() {
    const now = new Date();
    return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}
async function handler(req, res) {
    await requireAppCheckStrict(req, res);
    const uid = await requireAuth(req);
    const ref = db.doc(`users/${uid}/gate/${todayKey()}`);
    const now = Timestamp.now();
    let remaining = MAX_DAILY_FAILS;
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : {};
        const failed = Number(data.failed || 0) + 1;
        const passed = Number(data.passed || 0);
        remaining = Math.max(0, MAX_DAILY_FAILS - failed);
        tx.set(ref, {
            failed,
            passed,
            updatedAt: now,
            lastFailedAt: now,
        }, { merge: true });
    });
    res.json({ ok: true, remaining });
}
export const recordGateFailure = onRequest({ invoker: "public" }, withCors(async (req, res) => {
    try {
        await handler(req, res);
    }
    catch (error) {
        if (error instanceof HttpsError) {
            const status = error.code === "unauthenticated" ? 401 : 400;
            res.status(status).json({ ok: false, reason: error.code });
            return;
        }
        res.status(500).json({ ok: false, reason: "server_error" });
    }
}));
//# sourceMappingURL=recordGateFailure.js.map