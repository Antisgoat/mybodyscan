import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { verifyAppCheck } from "../http.js";
import { deletePushTokenOwnershipForUser } from "../pushTokenOwnership.js";

export const deleteAccount = onRequest(
  {
    cors: true,
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (req, res) => {
    if (req.method !== "POST")
      return res.status(405).json({ error: "method_not_allowed" });

    try {
      const authz = String(req.headers.authorization || "");
      const idToken = authz.startsWith("Bearer ") ? authz.slice(7) : "";
      if (!idToken) return res.status(401).json({ error: "missing_token" });

      const decoded = await getAuth().verifyIdToken(idToken, true);
      await verifyAppCheck(req);

      const now = Math.floor(Date.now() / 1000);
      const authAge = now - (decoded.auth_time || 0);
      if (!Number.isFinite(authAge) || authAge > 300) {
        return res.status(401).json({ error: "reauth_required" });
      }

      const uid = decoded.uid;
      logger.info("deleteAccount_start", { uid });

      await deleteUserData(uid);

      await getAuth().deleteUser(uid);
      logger.info("deleteAccount_done", { uid });

      return res.json({ ok: true });
    } catch (err: any) {
      logger.error("deleteAccount_failed", {
        err: String(err?.message || err),
      });
      if (err?.code === "permission-denied") {
        return res.status(403).json({ error: "app_check_required" });
      }
      if (String(err?.code || "").startsWith("auth/")) {
        return res.status(401).json({ error: "invalid_token" });
      }
      return res.status(500).json({ error: "internal" });
    }
  }
);

async function deleteUserData(uid: string) {
  const db = getFirestore();
  const bucket = getStorage().bucket();
  await bucket.deleteFiles({ prefix: `scans/${uid}/` });
  await bucket.deleteFiles({ prefix: `user_uploads/${uid}/` });
  await bucket.deleteFiles({ prefix: `transformation-previews/${uid}/` });
  await deletePushTokenOwnershipForUser(db, uid);
  await db.recursiveDelete(db.doc(`users/${uid}`));
}
