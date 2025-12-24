import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { onRequest, HttpsError } from "firebase-functions/v2/https";
import type { Request, Response } from "firebase-functions/v2/https";
import {
  getAuth,
  getFirestore,
  getStorage,
  Timestamp,
} from "../firebase.js";
import { allowCorsAndOptionalAppCheck } from "../http.js";
import { ensureSoftAppCheckFromRequest } from "../lib/appCheckSoft.js";
import { openAiSecretParam } from "../openai/keys.js";
import type { ScanDocument } from "../types.js";
import { getEngineConfigOrThrow } from "./engineConfig.js";

type Pose = "front" | "back" | "left" | "right";
type ParsedFile = {
  field: Pose;
  filename: string;
  contentType: string;
  buffer: Buffer;
  size: number;
};

type SubmitMultipartDeps = {
  firestore: FirebaseFirestore.Firestore;
  storage: ReturnType<typeof getStorage>;
  verifyIdToken: (token: string) => Promise<{ uid: string }>;
  now: () => FirebaseFirestore.Timestamp;
  ensureAppCheck: (
    req: Request,
    ctx: { fn: string; uid: string; requestId: string }
  ) => Promise<void>;
};

const EXPECTED_POSES: Pose[] = ["front", "back", "left", "right"];
const MAX_BYTES_PER_PHOTO = 2 * 1024 * 1024; // 2MB
const DEFAULT_DEPS: SubmitMultipartDeps = {
  firestore: getFirestore(),
  storage: getStorage(),
  verifyIdToken: (token: string) => getAuth().verifyIdToken(token),
  now: () => Timestamp.now() as FirebaseFirestore.Timestamp,
  ensureAppCheck: (req, ctx) =>
    ensureSoftAppCheckFromRequest(req, {
      fn: ctx.fn,
      uid: ctx.uid,
      requestId: ctx.requestId,
    }),
};

function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readHeader(req: Request, key: string): string {
  return toTrimmed((req.get?.(key) as string | undefined) || "");
}

function parseAuthHeader(req: Request): string {
  const header =
    readHeader(req, "authorization") || readHeader(req, "Authorization");
  if (!header) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  const match = header.match(/^Bearer (.+)$/);
  if (!match) {
    throw new HttpsError("unauthenticated", "Authentication required");
  }
  return match[1];
}

function splitBuffer(buffer: Buffer, delimiter: Buffer): Buffer[] {
  const parts: Buffer[] = [];
  let start = 0;
  while (true) {
    const index = buffer.indexOf(delimiter, start);
    if (index === -1) {
      parts.push(buffer.slice(start));
      break;
    }
    parts.push(buffer.slice(start, index));
    start = index + delimiter.length;
  }
  return parts;
}

function parseHeaders(headerText: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const lines = headerText.split(/\r\n/);
  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    headers[key] = value;
  }
  return headers;
}

function parseMultipartField(headerValue: string, key: string): string | null {
  const needle = `${key}="`;
  const start = headerValue.indexOf(needle);
  if (start < 0) return null;
  const valueStart = start + needle.length;
  const end = headerValue.indexOf("\"", valueStart);
  if (end < 0) return null;
  return headerValue.slice(valueStart, end);
}

function parseMultipartBody(req: Request): {
  fields: Record<string, string>;
  files: ParsedFile[];
} {
  const contentType = String(req.headers["content-type"] || "");
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) throw new Error("missing_boundary");
  const boundary = boundaryMatch[1].replace(/^"|"$/g, "");
  const rawBody = (req as any).rawBody;
  const rawBuffer = rawBody ? Buffer.from(rawBody) : null;
  if (!rawBuffer) throw new Error("missing_body");
  const delimiter = Buffer.from(`--${boundary}`);
  const parts = splitBuffer(rawBuffer, delimiter);
  const fields: Record<string, string> = {};
  const files: ParsedFile[] = [];

  for (const part of parts) {
    if (!part.length) continue;
    if (part.slice(0, 2).toString() === "--") break;
    let cleaned = part;
    if (cleaned.slice(0, 2).toString() === "\r\n") {
      cleaned = cleaned.slice(2);
    }
    if (cleaned.slice(-2).toString() === "\r\n") {
      cleaned = cleaned.slice(0, -2);
    }
    const headerEnd = cleaned.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) continue;
    const headerText = cleaned.slice(0, headerEnd).toString("utf8");
    const body = cleaned.slice(headerEnd + 4);
    const headers = parseHeaders(headerText);
    const disposition = headers["content-disposition"] || "";
    const name = parseMultipartField(disposition, "name");
    const filename = parseMultipartField(disposition, "filename");
    if (!name) continue;
    if (!filename) {
      fields[name] = body.toString("utf8").trim();
      continue;
    }
    const contentTypePart = headers["content-type"] || "application/octet-stream";
    files.push({
      field: name as Pose,
      filename,
      contentType: contentTypePart,
      buffer: body,
      size: body.length,
    });
  }

  return { fields, files };
}

function validateFiles(files: ParsedFile[]): Record<Pose, ParsedFile> {
  const mapped: Partial<Record<Pose, ParsedFile>> = {};
  for (const file of files) {
    if (!EXPECTED_POSES.includes(file.field)) {
      continue;
    }
    const type = file.contentType.toLowerCase();
    const isJpeg = type.includes("jpeg") || type.includes("jpg");
    if (!isJpeg) {
      throw new HttpsError(
        "invalid-argument",
        "Photos must be JPEG images.",
        { reason: "invalid_content_type", pose: file.field }
      );
    }
    if (file.size <= 0) {
      throw new HttpsError(
        "invalid-argument",
        "Empty photo received.",
        { reason: "empty_file", pose: file.field }
      );
    }
    if (file.size > MAX_BYTES_PER_PHOTO) {
      throw new HttpsError(
        "invalid-argument",
        "Photos must be 2MB or smaller.",
        { reason: "file_too_large", pose: file.field }
      );
    }
    mapped[file.field] = file;
  }
  for (const pose of EXPECTED_POSES) {
    if (!mapped[pose]) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required photos.",
        { reason: "missing_photo", pose }
      );
    }
  }
  return mapped as Record<Pose, ParsedFile>;
}

function buildStoragePath(uid: string, scanId: string, pose: Pose): string {
  return `user_uploads/${uid}/scans/${scanId}/${pose}.jpg`;
}

async function writeScanDoc(
  deps: SubmitMultipartDeps,
  uid: string,
  scanId: string,
  photoPaths: Record<Pose, string>,
  weights: { currentWeightKg: number; goalWeightKg: number },
  requestId: string,
  correlationId: string
): Promise<FirebaseFirestore.DocumentReference<ScanDocument>> {
  const docRef = deps.firestore.doc(
    `users/${uid}/scans/${scanId}`
  ) as FirebaseFirestore.DocumentReference<ScanDocument>;
  const snap = await docRef.get();
  const existing = snap.exists ? (snap.data() as ScanDocument) : null;
  const createdAt = existing?.createdAt ?? deps.now();
  await docRef.set(
    {
      id: scanId,
      uid,
      createdAt,
      updatedAt: deps.now(),
      completedAt: null,
      status: "uploading",
      lastStep: "uploading",
      lastStepAt: deps.now(),
      photoPaths,
      input: {
        currentWeightKg: weights.currentWeightKg,
        goalWeightKg: weights.goalWeightKg,
      },
      estimate: existing?.estimate ?? null,
      workoutPlan: existing?.workoutPlan ?? null,
      nutritionPlan: existing?.nutritionPlan ?? null,
      correlationId,
    },
    { merge: true }
  );
  return docRef;
}

async function markQueued(
  docRef: FirebaseFirestore.DocumentReference<ScanDocument>,
  deps: SubmitMultipartDeps,
  requestId: string,
  correlationId: string
): Promise<void> {
  await docRef.set(
    {
      status: "queued",
      lastStep: "queued",
      lastStepAt: deps.now(),
      updatedAt: deps.now(),
      completedAt: null,
      progress: 0,
      errorMessage: null,
      errorReason: null,
      errorInfo: null,
      processingRequestedAt: deps.now(),
      processingHeartbeatAt: deps.now(),
      submitRequestId: requestId,
      correlationId,
    },
    { merge: true }
  );
}

function parseWeights(fields: Record<string, string>): {
  currentWeightKg: number;
  goalWeightKg: number;
} {
  const currentWeightKg = Number(fields.currentWeightKg ?? fields.currentWeight);
  const goalWeightKg = Number(fields.goalWeightKg ?? fields.goalWeight);
  if (!Number.isFinite(currentWeightKg) || !Number.isFinite(goalWeightKg)) {
    throw new HttpsError("invalid-argument", "Missing or invalid weight data.", {
      reason: "invalid_scan_request",
    });
  }
  return { currentWeightKg, goalWeightKg };
}

export async function handleSubmitScanMultipart(
  req: Request,
  res: Response,
  deps: SubmitMultipartDeps = DEFAULT_DEPS
): Promise<void> {
  allowCorsAndOptionalAppCheck(req as any, res as any, () => undefined);
  const requestId = readHeader(req, "x-request-id") || randomUUID();
  res.set("X-Request-Id", requestId);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({
      ok: false,
      code: "method_not_allowed",
      message: "Method not allowed",
      debugId: requestId,
    });
    return;
  }

  try {
    const token = parseAuthHeader(req);
    const decoded = await deps
      .verifyIdToken(token)
      .catch(() => {
        throw new HttpsError("unauthenticated", "Authentication required");
      });
    const uid = decoded.uid;

    await deps.ensureAppCheck(req, {
      fn: "submitScanMultipart",
      uid,
      requestId,
    });
    // Validate engine + storage bucket before ingesting payloads.
    getEngineConfigOrThrow(requestId);

    let parsed: { fields: Record<string, string>; files: ParsedFile[] };
    try {
      parsed = parseMultipartBody(req);
    } catch (parseErr: any) {
      const reason =
        parseErr?.message === "missing_body" || parseErr?.message === "missing_boundary"
          ? "invalid_multipart"
          : "parse_failed";
      throw new HttpsError("invalid-argument", "Invalid upload payload.", {
        reason,
      });
    }
    const { fields, files } = parsed;
    const weights = parseWeights(fields);
    const mappedFiles = validateFiles(files);
    const providedScanId = toTrimmed(fields.scanId);
    const scanId = providedScanId || randomUUID();
    const correlationId =
      toTrimmed(fields.correlationId) || requestId || randomUUID();

    const photoPaths: Record<Pose, string> = {
      front: buildStoragePath(uid, scanId, "front"),
      back: buildStoragePath(uid, scanId, "back"),
      left: buildStoragePath(uid, scanId, "left"),
      right: buildStoragePath(uid, scanId, "right"),
    };

    const docRef = await writeScanDoc(
      deps,
      uid,
      scanId,
      photoPaths,
      weights,
      requestId,
      correlationId
    );

    const bucket = deps.storage.bucket();
    await Promise.all(
      EXPECTED_POSES.map(async (pose) => {
        const file = mappedFiles[pose];
        const object = bucket.file(photoPaths[pose]);
        await object.save(file.buffer, {
          resumable: false,
          contentType: "image/jpeg",
          cacheControl: "public,max-age=31536000",
          metadata: {
            metadata: {
              uid,
              scanId,
              pose,
              uploadedAt: new Date().toISOString(),
              correlationId,
            },
          },
        });
      })
    );

    await markQueued(docRef, deps, requestId, correlationId);

    res.json({
      ok: true,
      scanId,
      debugId: requestId,
      correlationId,
      status: "queued",
      photoPaths,
    });
  } catch (err: any) {
    const code =
      err instanceof HttpsError ? err.code : (err?.code as string | undefined);
    const status =
      err instanceof HttpsError ? statusFromErrorCode(code) : 500;
    const message =
      err instanceof HttpsError
        ? err.message || "Upload failed."
        : "Upload failed.";
    const reason =
      err instanceof HttpsError
        ? (err as any)?.details?.reason ?? err.code
        : "internal";
    console.error("scan_submit_multipart_failed", {
      requestId,
      code: err?.code,
      message: err?.message,
    });
    res.status(typeof status === "number" ? status : 500).json({
      ok: false,
      code: code || "internal",
      message,
      debugId: requestId,
      reason,
    });
  }
}

export const submitScanMultipart = onRequest(
  {
    invoker: "public",
    concurrency: 30,
    region: "us-central1",
    timeoutSeconds: 120,
    secrets: [openAiSecretParam],
  },
  async (req, res) => handleSubmitScanMultipart(req as Request, res as Response)
);

function statusFromErrorCode(code?: string): number {
  switch (code) {
    case "unauthenticated":
      return 401;
    case "permission-denied":
      return 403;
    case "invalid-argument":
      return 400;
    case "failed-precondition":
      return 412;
    case "unavailable":
      return 503;
    default:
      return 500;
  }
}
