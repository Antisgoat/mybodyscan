import { HttpsError } from "firebase-functions/v2/https";
import { getApp } from "firebase-admin/app";
import { getStorage } from "../firebase.js";
import { hasOpenAI } from "../lib/env.js";

type EngineStatus = {
  configured: boolean;
  missing: string[];
  bucket: string | null;
  bucketSource: "env" | "app" | "storage" | "unknown";
};

function normalizeBucketName(raw?: string | null): string | null {
  if (!raw) return null;
  let bucket = raw.trim();
  if (!bucket) return null;
  if (bucket.startsWith("gs://")) bucket = bucket.slice(5);
  if (bucket.endsWith(".firebasestorage.app")) {
    bucket = bucket.replace(/\.firebasestorage\.app$/, ".appspot.com");
  }
  try {
    const url = new URL(bucket);
    if (url.hostname) {
      bucket = url.hostname;
    }
  } catch {
    // not a URL — use raw bucket
  }
  return bucket || null;
}

function resolveBucket(): { bucket: string | null; source: EngineStatus["bucketSource"] } {
  const envBucket = normalizeBucketName(process.env.STORAGE_BUCKET ?? process.env.FIREBASE_STORAGE_BUCKET);
  if (envBucket) return { bucket: envBucket, source: "env" };
  const appBucket = normalizeBucketName(getApp().options?.storageBucket as string | undefined);
  if (appBucket) return { bucket: appBucket, source: "app" };
  try {
    const storageBucket = normalizeBucketName(getStorage().bucket().name);
    return { bucket: storageBucket, source: storageBucket ? "storage" : "unknown" };
  } catch {
    return { bucket: null, source: "unknown" };
  }
}

export function getScanEngineStatus(): EngineStatus {
  const missing: string[] = [];
  if (!hasOpenAI()) missing.push("OPENAI_API_KEY");
  const bucketInfo = resolveBucket();
  if (!bucketInfo.bucket) missing.push("STORAGE_BUCKET");
  return {
    configured: missing.length === 0,
    missing,
    bucket: bucketInfo.bucket,
    bucketSource: bucketInfo.source,
  };
}

export function assertScanEngineConfigured(correlationId?: string): void {
  const status = getScanEngineStatus();
  if (status.configured) return;
  throw new HttpsError("failed-precondition", "Scan engine not configured.", {
    reason: "engine_not_configured",
    missing: status.missing,
    bucket: status.bucket,
    correlationId,
  });
}
