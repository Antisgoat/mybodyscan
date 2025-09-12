import * as functions from "firebase-functions";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getScanProvider } from "./appConfig.js";
import Replicate from "replicate";
initializeApp();
const db = getFirestore();
const replicateToken = process.env.REPLICATE_API_TOKEN;
const replicate = replicateToken ? new Replicate({ auth: replicateToken }) : null;
export const runBodyScan = functions
    .region("us-central1")
    .runWith({ memory: "1GB", timeoutSeconds: 300 })
    .https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Auth required");
    }
    const { scanId } = data;
    const uid = context.auth.uid;
    const ref = db.doc(`users/${uid}/scans/${scanId}`);
    const snap = await ref.get();
    if (!snap.exists)
        throw new functions.https.HttpsError("not-found", "Scan not found");
    const scan = snap.data();
    await ref.update({ status: "processing", updatedAt: Date.now() });
    const provider = await getScanProvider();
    let result;
    try {
        if (provider === "leanlense") {
            result = await runLeanlensePlaceholder(scan);
        }
        else {
            result = await runReplicateMvp(scan);
        }
        await ref.update({
            status: "succeeded",
            metrics: result.metrics,
            logs: (scan.logs || []).concat(result.logs || []),
            updatedAt: Date.now(),
        });
    }
    catch (err) {
        await ref.update({
            status: "failed",
            logs: (scan.logs || []).concat([`error: ${err?.message || String(err)}`]),
            updatedAt: Date.now(),
        });
        throw new functions.https.HttpsError("internal", err?.message || "scan failed");
    }
});
async function runLeanlensePlaceholder(scan) {
    return {
        metrics: {
            body_fat_pct: null,
            note: "Leanlense pending; switch provider to replicate-mvp to compute estimates.",
        },
        logs: ["leanlense: no-op"],
    };
}
async function runReplicateMvp(scan) {
    const height = scan.input?.height_cm;
    const sex = scan.input?.sex;
    const front = scan.assets?.front_url;
    const side = scan.assets?.side_url;
    if (!height || !sex || !front || !side) {
        throw new Error("Missing height/sex/front/side for MVP pipeline");
    }
    if (!replicate) {
        // Return placeholder metrics when replicate token is absent
        return {
            metrics: { body_fat_pct: null, note: "Replicate token missing" },
            logs: ["replicate: token missing"],
        };
    }
    const denseposeModel = "chigozienri/densepose:latest";
    const [frontOut, sideOut] = await Promise.all([
        replicate.run(denseposeModel, { input: { input: front, overlay: false } }),
        replicate.run(denseposeModel, { input: { input: side, overlay: false } }),
    ]);
    const neck_cm = approxFromImage(36);
    const waist_cm = approxFromImage(82);
    const hip_cm = approxFromImage(98);
    const body_fat_pct = navyBfPct({ sex, heightCm: height, neckCm: neck_cm, waistCm: waist_cm, hipCm: hip_cm });
    const metrics = { neck_cm, waist_cm, hip_cm, body_fat_pct };
    return {
        metrics,
        logs: [
            "replicate-mvp: ran DensePose on front & side",
            `frontOut:${typeof frontOut}`,
            `sideOut:${typeof sideOut}`,
            "circumferences: heuristic placeholders; refine with mask parsing",
        ],
    };
}
function navyBfPct({ sex, heightCm, neckCm, waistCm, hipCm }) {
    const log10 = (x) => Math.log10(Math.max(x, 1e-3));
    if (sex === "male") {
        return 86.010 * log10(waistCm - neckCm) - 70.041 * log10(heightCm) + 36.76;
    }
    return 163.205 * log10((waistCm + (hipCm ?? 0)) - neckCm) - 97.684 * log10(heightCm) - 78.387;
}
function approxFromImage(defaultCm) {
    return defaultCm;
}
