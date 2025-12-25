import { onRequest, HttpsError } from "firebase-functions/v2/https";
import type { Request, Response } from "firebase-functions/v2/https";
import { getStorage } from "../firebase.js";
import { allowCorsAndOptionalAppCheck, requireAuth } from "../http.js";
import { buildScanPhotoPath, isScanPose } from "./paths.js";

type GetScanPhotoDeps = {
  storage: ReturnType<typeof getStorage>;
  requireAuth: typeof requireAuth;
  allowCorsAndOptionalAppCheck: typeof allowCorsAndOptionalAppCheck;
};

const DEFAULT_DEPS: GetScanPhotoDeps = {
  storage: getStorage(),
  requireAuth,
  allowCorsAndOptionalAppCheck,
};

function toTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function statusFromCode(code: string): number {
  if (code === "unauthenticated") return 401;
  if (code === "permission-denied") return 403;
  if (code === "invalid-argument") return 400;
  if (code === "not-found") return 404;
  return 500;
}

/**
 * Same-origin scan photo fetcher.
 * Eliminates browser traffic to Firebase Storage REST hosts.
 *
 * GET /api/scan/photo?scanId=...&pose=front
 * Auth required (Firebase ID token).
 */
export const getScanPhotoHttp = onRequest(
  { region: "us-central1", invoker: "public", concurrency: 80 },
  async (req: Request, res: Response) => handleGetScanPhotoHttp(req, res)
);

export async function handleGetScanPhotoHttp(
  req: Request,
  res: Response,
  deps: GetScanPhotoDeps = DEFAULT_DEPS
): Promise<void> {
  deps.allowCorsAndOptionalAppCheck(req, res, () => undefined);
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.status(405).end();
        return;
      }
      const scanId = toTrimmed(req.query.scanId);
      const pose = toTrimmed(req.query.pose);
      const token = toTrimmed(req.query.token);
      const uidParam = toTrimmed(req.query.uid);
      if (!scanId || !pose) {
        res.status(400).json({ ok: false, code: "invalid-argument", message: "Missing scanId/pose" });
        return;
      }
      if (!isScanPose(pose)) {
        res.status(400).json({ ok: false, code: "invalid-argument", message: "Invalid pose" });
        return;
      }

      // Auth required by default. For export flows, we also allow a download token + uid.
      const uid = token && uidParam ? uidParam : await deps.requireAuth(req);

      const bucket = deps.storage.bucket();
      const path = buildScanPhotoPath({ uid, scanId, pose });
      const file = bucket.file(path);
      const [exists] = await file.exists();
      if (!exists) {
        res.status(404).end();
        return;
      }

      if (token && uidParam) {
        // Validate Firebase download token against object metadata.
        const [meta] = await file.getMetadata().catch(() => [null as any]);
        const raw = meta?.metadata?.firebaseStorageDownloadTokens;
        const list =
          typeof raw === "string" && raw.trim().length ? raw.split(",").map((s: string) => s.trim()) : [];
        if (!list.includes(token)) {
          res.status(403).end();
          return;
        }
      }

      res.setHeader("Content-Type", "image/jpeg");
      // Private by default; token-based access is still “bearer-like”, so keep it private.
      res.setHeader("Cache-Control", "private, max-age=3600");

      if (req.method === "HEAD") {
        res.status(200).end();
        return;
      }

      file
        .createReadStream()
        .on("error", () => res.status(500).end())
        .pipe(res);
    } catch (err: any) {
      if (err instanceof HttpsError) {
        res.status(statusFromCode(err.code)).json({ ok: false, code: err.code, message: err.message });
        return;
      }
      res.status(500).end();
    }
}

