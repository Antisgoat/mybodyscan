import archiver from "archiver";
import { Timestamp } from "firebase-admin/firestore";
import type { DocumentReference, DocumentData } from "firebase-admin/firestore";
import { admin, db, functions, storage } from "./admin";
import { requireUserFromRequest } from "./auth";
import { consumeToken } from "./rateLimiter";
import * as crypto from "node:crypto";

function ipFromRequest(req: functions.https.Request): string {
  const forwarded = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0];
  return forwarded || (req.ip as string) || "anon";
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }
  if (value && typeof value === "object") {
    const nested: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      nested[key] = serializeValue(val);
    }
    return nested;
  }
  return value;
}

function serializeDoc(data: DocumentData | undefined | null) {
  if (!data) return null;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    result[key] = serializeValue(value);
  }
  return result;
}

export const exportData = functions.https.onRequest(async (req, res) => {
  const requestId = crypto.randomUUID();
  if (req.method !== "GET") {
    res.status(405).set("Allow", "GET").end();
    return;
  }
  const ip = ipFromRequest(req);
  if (!consumeToken(`export:${ip}`, 3, 1 / 60)) {
    res.status(429).json({ error: "Rate limit exceeded" });
    return;
  }
  try {
    const uid = await requireUserFromRequest(req, requestId);
    const profileSnap = await db.doc(`users/${uid}`).get();
    const scansSnap = await db.collection(`users/${uid}/scans`).get();
    const planMetaSnap = await db.doc(`users/${uid}/coach/plan/meta`).get();
    const planWeeksSnap = await db.collection(`users/${uid}/coach/plan`).get();
    const checkinsSnap = await db.collection(`users/${uid}/coach/checkins`).orderBy("createdAt", "asc").get();
    const nutritionSnap = await db.collection(`users/${uid}/nutritionLogs`).get();
    const workoutsSnap = await db.collection(`users/${uid}/workouts`).get();

    const summary: Record<string, unknown> = {
      profile: serializeDoc(profileSnap.data()),
      plan: {
        meta: serializeDoc(planMetaSnap.data()),
        weeks: planWeeksSnap.docs
          .filter((doc) => doc.id.startsWith("week"))
          .map((doc) => ({ id: doc.id, ...serializeDoc(doc.data()) })),
      },
      checkins: checkinsSnap.docs.map((doc) => ({ id: doc.id, ...serializeDoc(doc.data()) })),
      nutritionLogs: nutritionSnap.docs.map((doc) => ({ id: doc.id, ...serializeDoc(doc.data()) })),
      workouts: workoutsSnap.docs.map((doc) => ({ id: doc.id, ...serializeDoc(doc.data()) })),
      scans: scansSnap.docs.map((doc) => ({ id: doc.id, ...serializeDoc(doc.data()) })),
      generatedAt: new Date().toISOString(),
    };

    const archive = archiver("zip", { zlib: { level: 9 } });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename=\"mybodyscan-export-${Date.now()}.zip\"`);
    archive.pipe(res);
    archive.append(JSON.stringify(summary, null, 2), { name: "data/summary.json" });

    for (const scanDoc of scansSnap.docs) {
      const scanData = scanDoc.data() as any;
      const photos: string[] = scanData.photos || scanData.result?.photos || [];
      for (let index = 0; index < photos.length; index += 1) {
        const path = photos[index];
        if (!path) continue;
        try {
          const file = storage.bucket().file(path);
          const [buffer] = await file.download();
          const filename = path.split("/").pop() || `photo${index + 1}.jpg`;
          archive.append(buffer, { name: `scans/${scanDoc.id}/${filename}` });
        } catch (error) {
          functions.logger.warn("export_photo_missing", { requestId, uid, path, error });
        }
      }
    }

    archive.on("error", (err) => {
      functions.logger.error("export_archive_error", { requestId, error: err });
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate export" });
      }
    });
    await archive.finalize();
  } catch (err: any) {
    functions.logger.error("export_data_error", { requestId, error: err });
    res.status(err instanceof functions.https.HttpsError && err.code === "unauthenticated" ? 401 : 500).json({
      error: err?.message || "Export failed",
    });
  }
});

async function deleteDocumentRecursive(ref: DocumentReference) {
  const subcollections = await ref.listCollections();
  for (const collection of subcollections) {
    const documents = await collection.listDocuments();
    for (const doc of documents) {
      await deleteDocumentRecursive(doc);
      await doc.delete();
    }
  }
}

export const deleteAccount = functions.https.onRequest(async (req, res) => {
  const requestId = crypto.randomUUID();
  if (req.method !== "DELETE" && req.method !== "POST") {
    res.status(405).set("Allow", "DELETE, POST").end();
    return;
  }
  try {
    const uid = await requireUserFromRequest(req, requestId);
    const userRef = db.doc(`users/${uid}`);
    await deleteDocumentRecursive(userRef);
    await userRef.delete();
    try {
      await admin.auth().deleteUser(uid);
    } catch (error) {
      functions.logger.warn("delete_account_auth", { requestId, uid, error });
    }
    try {
      await storage.bucket().deleteFiles({ prefix: `uploads/${uid}/` });
    } catch (error) {
      functions.logger.warn("delete_account_storage", { requestId, uid, error });
    }
    res.json({ ok: true });
  } catch (err: any) {
    functions.logger.error("delete_account_error", { requestId, error: err });
    res.status(err instanceof functions.https.HttpsError && err.code === "unauthenticated" ? 401 : 500).json({
      error: err?.message || "Deletion failed",
    });
  }
});
