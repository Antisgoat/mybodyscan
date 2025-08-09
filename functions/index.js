import functions from "firebase-functions";
import admin from "firebase-admin";
import corsLib from "cors";

admin.initializeApp();
const db = admin.firestore();
const cors = corsLib({ origin: true });

// Helper: verify ID token from "Authorization: Bearer <idToken>"
async function requireAuth(req) {
  const h = req.headers.authorization || "";
  const idToken = h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!idToken) return null;
  try { return await admin.auth().verifyIdToken(idToken); } catch { return null; }
}

// GET user height if present (for BMI). Returns cm or null.
async function getUserHeightCm(uid) {
  try {
    const snap = await db.doc(`users/${uid}`).get();
    const cm = snap.exists ? snap.data()?.heightCm : null;
    return (typeof cm === "number" && cm > 0) ? cm : null;
  } catch { return null; }
}

// BMI helper if height available
function computeBMIkgM2(weightKg, heightCm) {
  if (typeof weightKg !== "number" || typeof heightCm !== "number" || heightCm <= 0) return null;
  const m = heightCm / 100;
  return +(weightKg / (m * m)).toFixed(1);
}

// POST /createScan  (STUB: instant success)
export const createScan = functions.region("us-central1").https.onRequest(async (req, res) => {
  return cors(req, res, async () => {
    try {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const user = await requireAuth(req);
      if (!user) return res.status(401).json({ error: "UNAUTHENTICATED" });

      const { scanId } = req.body || {};
      if (!scanId) return res.status(400).json({ error: "Missing scanId" });

      const ref = db.doc(`users/${user.uid}/scans/${scanId}`);
      const snap = await ref.get();
      if (!snap.exists) return res.status(404).json({ error: "Scan not found" });
      const data = snap.data();
      if (data?.uid !== user.uid) return res.status(403).json({ error: "Forbidden" });

      // move to processing
      await ref.update({ status: "processing", updatedAt: admin.firestore.FieldValue.serverTimestamp() });

      // generate plausible results (stable-ish but varied)
      const seed = scanId.split("").reduce((a,c)=>a+c.charCodeAt(0), 0) % 1000;
      const rand = (min, max, s=1) => {
        const r = Math.abs(Math.sin(seed + Date.now()/1e7 + s));
        return +(min + r*(max-min)).toFixed(1);
      };

      // body fat 14–32%, weight 130–220 lb
      const bodyFatPct = rand(18, 28, 2);
      const weightLb   = Math.round(rand(150, 200, 3));
      const weightKg   = +(weightLb / 2.20462).toFixed(1);

      const heightCm = await getUserHeightCm(user.uid);
      const BMI = heightCm ? computeBMIkgM2(weightKg, heightCm) : null;

      // mark done
      await ref.update({
        status: "done",
        results: {
          bodyFatPct,
          weightKg,
          weightLb,
          ...(BMI != null ? { BMI } : {})
        },
        modelVersion: "stub-v1",
        qualityScore: 0.9,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.json({ ok: true, stub: true });
    } catch (e) {
      console.error(e);
      try {
        const user = await requireAuth(req);
        const scanId = req.body?.scanId;
        if (user?.uid && scanId) {
          await db.doc(`users/${user.uid}/scans/${scanId}`).update({
            status: "error",
            errorMsg: String(e?.message || e)
          });
        }
      } catch {}
      return res.status(500).json({ error: "Internal error" });
    }
  });
});
