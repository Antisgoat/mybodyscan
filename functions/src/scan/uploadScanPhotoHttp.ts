import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { onRequest, HttpsError } from "firebase-functions/v2/https";
import type { Request, Response } from "firebase-functions/v2/https";
import { getStorage } from "../firebase.js";
import { allowCorsAndOptionalAppCheck, requireAuth } from "../http.js";
import { buildScanPhotoPath, isScanPose } from "./paths.js";

const storage = getStorage();
const MAX_BYTES = 15 * 1024 * 1024;

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function buildError(code: string, message: string, details?: unknown) {
  return { ok: false, code, message, details } as const;
}

function statusFromCode(code: string): number {
  if (code === "unauthenticated") return 401;
  if (code === "permission-denied") return 403;
  if (code === "invalid-argument") return 400;
  if (code === "failed-precondition") return 412;
  if (code === "unavailable") return 503;
  return 500;
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
  const end = headerValue.indexOf('"', valueStart);
  if (end < 0) return null;
  return headerValue.slice(valueStart, end);
}

async function parseMultipart(req: Request): Promise<{
  fields: Record<string, string>;
  file: Buffer | null;
  fileSize: number;
  fileContentType?: string;
}> {
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
  let fileBuffer: Buffer | null = null;
  let fileSize = 0;
  let fileContentType: string | undefined = undefined;

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
    if (!name) continue;
    if (name === "file" || name === "image" || name === "photo") {
      fileSize = body.length;
      if (fileSize > MAX_BYTES) throw new Error("file_too_large");
      fileBuffer = body;
      const ct = headers["content-type"];
      if (typeof ct === "string" && ct.trim()) {
        fileContentType = ct.trim().toLowerCase();
      }
    } else {
      fields[name] = body.toString("utf8").trim();
    }
  }

  return { fields, file: fileBuffer, fileSize, fileContentType };
}

async function parseOctetStream(req: Request): Promise<{
  fields: Record<string, string>;
  file: Buffer | null;
  fileSize: number;
  fileContentType?: string;
}> {
  const rawBody = (req as any).rawBody;
  const file = rawBody ? Buffer.from(rawBody) : null;
  const fileSize = file
    ? Number((file as any).length ?? (file as any).byteLength ?? 0)
    : 0;
  const fields: Record<string, string> = {
    scanId: toTrimmedString(req.query.scanId),
    view: toTrimmedString(req.query.view),
    pose: toTrimmedString(req.query.pose),
    correlationId: toTrimmedString(req.query.correlationId),
  };
  const headerScanId = toTrimmedString(req.get("x-scan-id"));
  const headerView = toTrimmedString(req.get("x-scan-view"));
  if (!fields.scanId && headerScanId) fields.scanId = headerScanId;
  if (!fields.view && headerView) fields.view = headerView;
  const fileContentTypeHeader = toTrimmedString(req.headers["content-type"]);
  return {
    fields,
    file,
    fileSize,
    fileContentType: fileContentTypeHeader ? fileContentTypeHeader.toLowerCase() : undefined,
  };
}

export const uploadScanPhotoHttp = onRequest(
  { region: "us-central1", invoker: "public", concurrency: 40 },
  async (req: Request, res: Response) => {
    allowCorsAndOptionalAppCheck(req, res, () => undefined);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    const startedAt = Date.now();
    const correlationId =
      toTrimmedString(req.get("x-correlation-id")) || randomUUID();
    try {
      if (req.method !== "POST") {
        res.status(405).json(buildError("method_not_allowed", "Method not allowed"));
        return;
      }

      const uid = await requireAuth(req);
      const contentType = String(req.headers["content-type"] || "");
      const parsed = contentType.includes("multipart/form-data")
        ? await parseMultipart(req)
        : await parseOctetStream(req);

      const scanId = toTrimmedString(parsed.fields.scanId || req.body?.scanId);
      const view = toTrimmedString(
        parsed.fields.view || parsed.fields.pose || req.body?.view || req.body?.pose
      );
      const correlationIdFinal =
        toTrimmedString(parsed.fields.correlationId) || correlationId;

      if (!scanId || !view) {
        res.status(400).json(buildError("invalid-argument", "Missing scanId/view"));
        return;
      }
      if (!isScanPose(view)) {
        res
          .status(400)
          .json(buildError("invalid-argument", "Invalid view provided"));
        return;
      }

      const file = parsed.file;
      const size = parsed.fileSize;
      if (!file || size <= 0) {
        res.status(400).json(buildError("invalid-argument", "Missing file"));
        return;
      }
      if (size > MAX_BYTES) {
        res
          .status(413)
          .json(buildError("invalid-argument", "File too large"));
        return;
      }
      const fileType = String(parsed.fileContentType || "").toLowerCase();
      if (fileType && !fileType.includes("jpeg") && !fileType.includes("jpg")) {
        res
          .status(415)
          .json(buildError("invalid-argument", "Photos must be JPEG images."));
        return;
      }

      const bucket = storage.bucket();
      const path = buildScanPhotoPath({ uid, scanId, pose: view });
      const uploadedAt = new Date().toISOString();
      // Ensure Firebase web clients can resolve `getDownloadURL()` for Admin-written objects.
      // (Firebase stores download tokens in custom metadata under `firebaseStorageDownloadTokens`.)
      const downloadToken = randomUUID();

      const object = bucket.file(path);
      await object.save(file, {
        resumable: false,
        contentType: "image/jpeg",
        cacheControl: "public,max-age=31536000",
        metadata: {
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            uid,
            scanId,
            view,
            uploadedAt,
            correlationId: correlationIdFinal,
          },
        },
      });

      const [meta] = await object.getMetadata();
      const elapsedMs = Date.now() - startedAt;
      console.info("scan_upload_http", {
        correlationId: correlationIdFinal,
        uid,
        scanId,
        view,
        size,
        elapsedMs,
      });

      res.json({
        ok: true,
        scanId,
        pose: view,
        bucket: bucket.name,
        path,
        storagePath: path,
        size,
        sizeBytes: size,
        contentType: "image/jpeg",
        generation: meta?.generation,
        md5: meta?.md5Hash,
      });
    } catch (err: any) {
      const elapsedMs = Date.now() - startedAt;
      if (err?.message === "file_too_large") {
        res.status(413).json(buildError("invalid-argument", "File too large"));
        return;
      }
      if (err?.message === "missing_boundary" || err?.message === "missing_body") {
        res.status(400).json(buildError("invalid-argument", "Invalid multipart payload"));
        return;
      }
      if (err instanceof HttpsError) {
        const details = (err as any)?.details ?? {};
        const reason = details?.reason;
        const normalizedCode =
          reason === "scan_engine_not_configured" ? "scan_engine_not_configured" : err.code;
        const missing = Array.isArray(details?.missing) ? details.missing : undefined;
        console.warn("scan_upload_http_error", {
          correlationId,
          code: err.code,
          message: err.message,
          elapsedMs,
        });
        res
          .status(reason === "scan_engine_not_configured" ? 503 : statusFromCode(err.code))
          .json(buildError(normalizedCode, err.message, { reason, missing }));
        return;
      }
      console.error("scan_upload_http_failed", {
        correlationId,
        message: err?.message,
        elapsedMs,
      });
      res.status(500).json(buildError("internal", "Upload failed"));
    }
  }
);
