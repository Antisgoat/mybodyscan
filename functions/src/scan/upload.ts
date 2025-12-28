/**
 * Pipeline map — Server-mediated scan upload:
 * - Accepts multipart form data (4 photos + weights) with Firebase Auth.
 * - Writes photos to Storage at canonical paths: scans/{uid}/{scanId}/{pose}.jpg.
 * - Persists Firestore doc with uploadedPoses + storagePaths + weights.
 * - Marks scan as queued so the existing worker picks up analysis.
 */
import { Buffer as NodeBuffer } from "node:buffer";
import { Busboy } from "@fastify/busboy";
import { HttpsError, onRequest } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { randomUUID } from "node:crypto";
import { Timestamp, getFirestore, getStorage } from "../firebase.js";
import { requireAuthWithClaims } from "../http.js";
import { ensureSoftAppCheckFromRequest } from "../lib/appCheckSoft.js";
import { openAiSecretParam } from "../openai/keys.js";
import type { ScanDocument } from "../types.js";
import { getEngineConfigOrThrow } from "./engineConfig.js";
import { buildScanPhotoPath, SCAN_POSES, type ScanPose } from "./paths.js";

const db = getFirestore();
const storage = getStorage();

type Pose = ScanPose;
type ParsedFile = {
  pose: Pose;
  data: Buffer;
  filename: string;
  mimeType: string;
};

function statusFromHttpsError(error: HttpsError): number {
  const status = (error as any)?.httpErrorCode?.status;
  if (typeof status === "number") {
    return status;
  }
  switch (error.code) {
    case "invalid-argument":
      return 400;
    case "failed-precondition":
      return 412;
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    case "not-found":
      return 404;
    default:
      return 500;
  }
}

function parsePose(fieldName: string): Pose | null {
  switch (fieldName) {
    case "front":
    case "back":
    case "left":
    case "right":
      return fieldName;
    default:
      return null;
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function parseMultipart(
  req: Request
): Promise<{ fields: Record<string, string>; files: ParsedFile[] }> {
  return await new Promise((resolve, reject) => {
    const files: ParsedFile[] = [];
    const fields: Record<string, string> = {};
    const busboy = Busboy({
      headers: req.headers,
      limits: {
        fileSize: 12 * 1024 * 1024, // 12MB per photo after client compression
        files: 8,
        fields: 24,
      },
    });

    busboy.on("file", (field, stream, filename, _encoding, mimeType) => {
      const pose = parsePose(field);
      if (!pose) {
        stream.resume();
        return;
      }
      const chunks: Buffer[] = [];
      stream.on("data", (data: Buffer) => chunks.push(data));
      stream.on("limit", () =>
        reject(
          new HttpsError(
            "invalid-argument",
            "Photo too large.",
            { pose }
          )
        )
      );
      stream.on("end", () => {
        const buffer = (NodeBuffer as any).concat(chunks);
        files.push({
          pose,
          data: buffer,
          filename,
          mimeType: mimeType || "application/octet-stream",
        });
      });
    });

    busboy.on("field", (name, value) => {
      fields[name] = value;
    });

    busboy.on("error", (err) => reject(err));
    busboy.on("finish", () => resolve({ fields, files }));

    const raw = (req as any).rawBody as Buffer | undefined;
    if (raw) {
      busboy.end(raw);
    } else {
      (req as any as NodeJS.ReadableStream).pipe(busboy);
    }
  });
}

function toKg(value: number, unit: string): number {
  if (!Number.isFinite(value)) return NaN;
  const normalized = unit.toLowerCase();
  if (normalized === "lb" || normalized === "lbs") {
    return value * 0.45359237;
  }
  return value;
}

async function savePhoto(params: {
  uid: string;
  scanId: string;
  pose: Pose;
  buffer: Buffer;
  mimeType: string;
  correlationId: string;
}): Promise<{ path: string }> {
  const path = buildScanPhotoPath({
    uid: params.uid,
    scanId: params.scanId,
    pose: params.pose,
  });
  const file = storage.bucket().file(path);
  const contentType = params.mimeType && params.mimeType.startsWith("image/")
    ? params.mimeType
    : "image/jpeg";
  await file.save(params.buffer, {
    contentType,
    resumable: false,
    metadata: {
      cacheControl: "public,max-age=31536000",
      metadata: {
        scanId: params.scanId,
        pose: params.pose,
        correlationId: params.correlationId,
      },
    },
  });
  return { path };
}

function buildResponseError(res: any, error: unknown, requestId: string) {
  if (error instanceof HttpsError) {
    const details = (error as { details?: any }).details || {};
    const debugId = details?.debugId ?? requestId;
    const reason = details?.reason;
    res.status(statusFromHttpsError(error)).json({
      code: error.code,
      message: error.message || "Unable to upload scan.",
      debugId,
      reason,
    });
    return;
  }
  console.error("scan_upload_unhandled", {
    message: (error as Error)?.message,
    stack: (error as Error)?.stack,
    requestId,
  });
  res.status(500).json({
    code: "scan_internal_error",
    message: "Unexpected error while uploading scan.",
    debugId: requestId,
    reason: "server_error",
  });
}

export const scanUpload = onRequest(
  {
    invoker: "public",
    concurrency: 10,
    timeoutSeconds: 120,
    region: "us-central1",
    maxInstances: 50,
    secrets: [openAiSecretParam],
  },
  async (req, res) => {
    const requestId = req.get?.("x-request-id")?.trim() || randomUUID();
    res.set("Access-Control-Allow-Origin", "*");
    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Firebase-AppCheck, X-Correlation-Id, X-Request-Id"
    );
    res.set("X-Request-Id", requestId);

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({
        code: "method_not_allowed",
        message: "Method not allowed",
        debugId: requestId,
      });
      return;
    }

    try {
      const authContext = await requireAuthWithClaims(req as Request);
      const { uid } = authContext;
      let correlationId =
        req.get("x-correlation-id")?.trim() ||
        (typeof req.body?.correlationId === "string"
          ? req.body.correlationId
          : undefined) ||
        requestId;
      await ensureSoftAppCheckFromRequest(req as Request, {
        fn: "scanUpload",
        uid,
        requestId,
      });
      // Ensure model + storage config exist before accepting uploads.
      getEngineConfigOrThrow(correlationId);

      const { fields, files } = await parseMultipart(req as Request);
      if (!correlationId && typeof fields.correlationId === "string") {
        correlationId = fields.correlationId;
      }
      const currentWeightRaw =
        toNumber(fields.currentWeight ?? fields.currentWeightKg ?? fields.weight) ??
        toNumber(fields.currentWeightLb);
      const goalWeightRaw =
        toNumber(fields.goalWeight ?? fields.goalWeightKg ?? fields.targetWeight) ??
        toNumber(fields.goalWeightLb);
      const heightRaw =
        toNumber((fields as any).height ?? (fields as any).heightCm ?? (fields as any).height_cm) ??
        null;
      const unitRaw = (fields.unit || fields.units || "kg").toString().toLowerCase();
      const unit = unitRaw === "lb" || unitRaw === "lbs" ? "lb" : "kg";
      if (!Number.isFinite(currentWeightRaw ?? NaN) || !Number.isFinite(goalWeightRaw ?? NaN)) {
        throw new HttpsError("invalid-argument", "Missing or invalid weights.", {
          debugId: requestId,
          reason: "invalid_weights",
        });
      }
      const currentWeightKg = toKg(currentWeightRaw as number, unit);
      const goalWeightKg = toKg(goalWeightRaw as number, unit);
      if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) {
        throw new HttpsError("invalid-argument", "Weights must be numeric.", {
          debugId: requestId,
          reason: "invalid_weights",
        });
      }
      const heightCm =
        Number.isFinite(heightRaw ?? NaN) && (heightRaw as number) > 0
          ? Math.round(heightRaw as number)
          : undefined;

      const grouped: Record<Pose, ParsedFile | undefined> = {
        front: undefined,
        back: undefined,
        left: undefined,
        right: undefined,
      };
      for (const file of files) {
        if (!grouped[file.pose]) grouped[file.pose] = file;
      }
      const missing = SCAN_POSES.filter((pose) => !grouped[pose]);
      if (missing.length) {
        throw new HttpsError(
          "invalid-argument",
          `Missing photo(s): ${missing.join(", ")}`,
          { debugId: requestId, reason: "missing_photos", missing }
        );
      }

      const scanId =
        (typeof fields.scanId === "string" && fields.scanId.trim().length
          ? fields.scanId.trim()
          : null) || randomUUID();
      const paths: Record<Pose, string> = {
        front: buildScanPhotoPath({ uid, scanId, pose: "front" }),
        back: buildScanPhotoPath({ uid, scanId, pose: "back" }),
        left: buildScanPhotoPath({ uid, scanId, pose: "left" }),
        right: buildScanPhotoPath({ uid, scanId, pose: "right" }),
      };

      const saves = SCAN_POSES.map((pose) =>
        savePhoto({
          uid,
          scanId,
          pose,
          buffer: grouped[pose]!.data,
          mimeType: grouped[pose]!.mimeType,
          correlationId,
        })
      );
      await Promise.all(saves);

      const now = Timestamp.now() as FirebaseFirestore.Timestamp;
      const docRef = db.doc(
        `users/${uid}/scans/${scanId}`
      ) as FirebaseFirestore.DocumentReference<ScanDocument>;
      const existingSnap = await docRef.get();
      const existing = existingSnap.exists ? (existingSnap.data() as ScanDocument) : null;

      const photoObjects = {
        front: { bucket: storage.bucket().name, path: paths.front, downloadURL: null },
        back: { bucket: storage.bucket().name, path: paths.back, downloadURL: null },
        left: { bucket: storage.bucket().name, path: paths.left, downloadURL: null },
        right: { bucket: storage.bucket().name, path: paths.right, downloadURL: null },
      };

      await docRef.set(
        {
          id: scanId,
          uid,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          completedAt: null,
          status: "queued",
          lastStep: "queued",
          lastStepAt: now,
          errorMessage: null,
          errorReason: null,
          errorInfo: null,
          progress: 0,
          correlationId,
          processingRequestedAt: now,
          submitRequestId: requestId,
          photoPaths: paths,
          photoObjects,
          uploadedPoses: {
            front: true,
            back: true,
            left: true,
            right: true,
          },
          weights: {
            current: currentWeightRaw,
            goal: goalWeightRaw,
            unit,
          },
          input: {
            currentWeightKg,
            goalWeightKg,
            heightCm: heightCm ?? undefined,
          },
        },
        { merge: true }
      );

      console.info("scan_upload_complete", {
        uid,
        scanId,
        requestId,
        correlationId,
      });

      res.json({
        scanId,
        status: "queued",
        uploadedPoses: {
          front: true,
          back: true,
          left: true,
          right: true,
        },
        debugId: requestId,
        correlationId,
      });
    } catch (error) {
      buildResponseError(res, error, requestId);
    }
  }
);
