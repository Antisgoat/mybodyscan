import { randomUUID } from "node:crypto";
import { onRequest, HttpsError } from "firebase-functions/v2/https";
import type { Request } from "firebase-functions/v2/https";
import { getStorage } from "../firebase.js";
import { allowCorsAndOptionalAppCheck, requireAuth } from "../http.js";
import { ensureSoftAppCheckFromRequest } from "../lib/appCheckSoft.js";
import { buildScanPhotoPath, assertScanPose } from "./paths.js";

type UploadPayload = {
  scanId: string;
  pose: string;
  contentType: string;
  data: string;
  path?: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
};

const storage = getStorage();
const MAX_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_TYPES = ["image/jpeg", "image/jpg"];

function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parsePayload(body: any): UploadPayload {
  if (!body || typeof body !== "object") {
    throw new HttpsError("invalid-argument", "Invalid upload payload.", {
      reason: "invalid_payload",
    });
  }
  const scanId = toTrimmed(body.scanId);
  const pose = toTrimmed(body.pose);
  const contentType = toTrimmed(body.contentType || body.mimeType || "");
  const data = typeof body.data === "string" ? body.data.trim() : "";
  const path = typeof body.path === "string" ? body.path.trim() : undefined;
  const correlationId =
    typeof body.correlationId === "string" && body.correlationId.trim()
      ? body.correlationId.trim().slice(0, 64)
      : undefined;
  const metadata =
    body.metadata && typeof body.metadata === "object" ? body.metadata : undefined;

  if (!scanId || !pose || !contentType || !data) {
    throw new HttpsError("invalid-argument", "Missing upload data.", {
      reason: "missing_fields",
    });
  }
  assertScanPose(pose as any);
  const normalizedType = contentType.toLowerCase();
  if (!ALLOWED_TYPES.includes(normalizedType)) {
    throw new HttpsError(
      "invalid-argument",
      "Photos must be JPEG images.",
      { reason: "invalid_content_type" }
    );
  }
  return { scanId, pose, contentType: "image/jpeg", data, path, correlationId, metadata };
}

function decodeBase64(input: string): Buffer {
  const cleaned = input.includes(",") ? input.slice(input.indexOf(",") + 1) : input;
  try {
    return Buffer.from(cleaned, "base64");
  } catch {
    throw new HttpsError("invalid-argument", "Invalid upload data.", {
      reason: "invalid_base64",
    });
  }
}

function sanitizeMetadata(metadata?: Record<string, unknown>): Record<string, string> | undefined {
  if (!metadata) return undefined;
  const entries = Object.entries(metadata)
    .filter(([_, value]) => typeof value === "string" || typeof value === "number")
    .map(([key, value]) => [key, value.toString().slice(0, 256)]);
  if (!entries.length) return undefined;
  return Object.fromEntries(entries);
}

export const uploadScanPhotoServer = onRequest(
  { region: "us-central1", timeoutSeconds: 120, cors: false },
  async (req, res) => {
    const requestId = req.get?.("x-request-id")?.trim() || randomUUID();
    res.set("X-Request-Id", requestId);
    allowCorsAndOptionalAppCheck(req as any, res as any, () => undefined);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    try {
      if (req.method !== "POST") {
        throw new HttpsError("unimplemented", "Method not allowed.", {
          reason: "method_not_allowed",
          debugId: requestId,
        });
      }

      const uid = await requireAuth(req as any as Request);
      await ensureSoftAppCheckFromRequest(req as any as Request, {
        fn: "uploadScanPhotoServer",
        uid,
        requestId,
      });

      const payload = parsePayload(req.body);
      const path = buildScanPhotoPath({
        uid,
        scanId: payload.scanId,
        pose: payload.pose as any,
      });
      if (payload.path && payload.path !== path) {
        throw new HttpsError("permission-denied", "Invalid upload path supplied.", {
          reason: "invalid_path",
        });
      }

      const buffer = decodeBase64(payload.data);
      const size = buffer.byteLength;
      if (size <= 0) {
        throw new HttpsError("invalid-argument", "Empty photo received.", {
          reason: "empty_file",
        });
      }
      if (size > MAX_BYTES) {
        throw new HttpsError("invalid-argument", "File too large.", {
          reason: "file_too_large",
          maxBytes: MAX_BYTES,
          size,
        });
      }

      const bucket = storage.bucket();
      const file = bucket.file(path);
      await file.save(buffer, {
        resumable: false,
        contentType: payload.contentType,
        metadata: {
          contentType: payload.contentType,
          cacheControl: "public,max-age=31536000",
          metadata: sanitizeMetadata(payload.metadata),
        },
      });

      console.info("scan_upload_fallback_ok", {
        uid,
        scanId: payload.scanId,
        pose: payload.pose,
        path,
        size,
        correlationId: payload.correlationId || requestId,
        requestId,
      });

      res.status(200).json({
        ok: true,
        path,
        bucket: bucket.name,
        bytes: size,
        correlationId: payload.correlationId || requestId,
      });
    } catch (error: any) {
      const statusCode =
        typeof error?.httpErrorCode?.status === "number"
          ? error.httpErrorCode.status
          : error?.code === "unauthenticated"
            ? 401
            : error?.code === "permission-denied"
              ? 403
              : 400;
      const code = error?.code || "unknown";
      console.error("scan_upload_fallback_error", {
        requestId,
        code,
        message: error?.message,
      });
      res.status(statusCode).json({
        ok: false,
        error: {
          code,
          message:
            error instanceof HttpsError && typeof error.message === "string"
              ? error.message
              : "Upload failed.",
          debugId: requestId,
        },
      });
    }
  }
);
