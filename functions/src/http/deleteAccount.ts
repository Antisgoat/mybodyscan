import type { Request, Response } from "express";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { appCheckSoft } from "../middleware/appCheckSoft.js";

export const deleteAccount = onRequest(
  {
    cors: true,
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
      await runSoftAppCheck(req, res);

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
      return res.status(500).json({ error: "internal" });
    }
  }
);

async function runSoftAppCheck(req: Request, res: Response): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      appCheckSoft(req, res, () => resolve());
    } catch (error) {
      logger.warn("deleteAccount_appcheck_error", {
        message: (error as Error)?.message,
      });
      resolve();
    }
  });
}

async function deleteUserData(uid: string) {
  const db = getFirestore();

  const subcols = [
    `users/${uid}/scans`,
    `users/${uid}/nutritionLogs`,
    `users/${uid}/coach`,
    `users/${uid}/healthDaily`,
  ];

  for (const path of subcols) {
    await deleteCollectionBatched(db, path, 200);
  }

  await db
    .doc(`users/${uid}`)
    .delete()
    .catch(() => {});

  const bucket = getStorage().bucket();
  await bucket.deleteFiles({ prefix: `scans/${uid}/` }).catch(() => {});
}

async function deleteCollectionBatched(
  db: Firestore,
  collectionPath: string,
  batchSize = 200
) {
  while (true) {
    const snap = await db.collection(collectionPath).limit(batchSize).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
