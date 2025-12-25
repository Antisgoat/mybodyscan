import { defineString } from "firebase-functions/params";
import { HttpsError } from "firebase-functions/v2/https";
import { getApp } from "firebase-admin/app";
import { getStorage } from "../firebase.js";
import { openAiSecretParam } from "../openai/keys.js";

type EngineStatus = {
  configured: boolean;
  missing: string[];
  bucket: string | null;
  bucketSource: "env" | "app" | "storage" | "unknown";
  projectId: string | null;
  provider: string | null;
  model: string | null;
  baseUrl: string | null;
};

export type EngineConfig = {
  provider: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  storageBucket: string;
  projectId: string;
};

const openAiModelParam = defineString("OPENAI_MODEL");
const openAiBaseUrlParam = defineString("OPENAI_BASE_URL");
const openAiProviderParam = defineString("OPENAI_PROVIDER");

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

function readParamValue(param: { value(): string | undefined }): string {
  try {
    const value = param.value();
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function resolveOpenAIKey(): string {
  const envKey = (process.env.OPENAI_API_KEY || "").trim();
  if (envKey) return envKey;
  const secretValue = readParamValue(openAiSecretParam);
  return secretValue;
}

function resolveModel(): string | null {
  const envModel = (process.env.OPENAI_MODEL || "").trim();
  if (envModel) return envModel;
  const paramModel = readParamValue(openAiModelParam);
  return paramModel || null;
}

function resolveBaseUrl(): string | null {
  const envBase = (process.env.OPENAI_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const paramBase = readParamValue(openAiBaseUrlParam);
  return paramBase ? paramBase.replace(/\/+$/, "") : null;
}

function resolveProvider(): string | null {
  const envProvider = (process.env.OPENAI_PROVIDER || "").trim();
  if (envProvider) return envProvider.toLowerCase();
  const paramProvider = readParamValue(openAiProviderParam);
  if (paramProvider) return paramProvider.toLowerCase();
  return null;
}

function resolveProjectId(): string | null {
  const envProject =
    (process.env.GCLOUD_PROJECT || "").trim() ||
    (process.env.GCP_PROJECT || "").trim();
  if (envProject) return envProject;
  try {
    const config = JSON.parse(process.env.FIREBASE_CONFIG || "{}") as { projectId?: string };
    if (config?.projectId) return config.projectId;
  } catch {
    // ignore
  }
  return null;
}

function buildStatus():
  | { status: EngineStatus; config: EngineConfig }
  | { status: EngineStatus; config: null } {
  const apiKey = resolveOpenAIKey();
  const bucketInfo = resolveBucket();
  const projectId = resolveProjectId();
  const model = resolveModel();
  const baseUrl = resolveBaseUrl();
  const provider = resolveProvider();

  const missing: string[] = [];
  if (!apiKey) missing.push("OPENAI_API_KEY");
  if (!provider) missing.push("OPENAI_PROVIDER");
  if (!model) missing.push("OPENAI_MODEL");
  if (!baseUrl) missing.push("OPENAI_BASE_URL");
  if (!bucketInfo.bucket) missing.push("STORAGE_BUCKET");
  if (!projectId) missing.push("PROJECT_ID");

  const status: EngineStatus = {
    configured: missing.length === 0,
    missing,
    bucket: bucketInfo.bucket,
    bucketSource: bucketInfo.source,
    projectId,
    provider,
    model,
    baseUrl,
  };

  if (
    missing.length > 0 ||
    !apiKey ||
    !bucketInfo.bucket ||
    !projectId ||
    !provider ||
    !model ||
    !baseUrl
  ) {
    return { status, config: null };
  }

  return {
    status,
    config: {
      provider,
      apiKey,
      model,
      baseUrl,
      storageBucket: bucketInfo.bucket,
      projectId,
    },
  };
}

export function getScanEngineStatus(): EngineStatus {
  return buildStatus().status;
}

export function engineConfigured(): boolean {
  return buildStatus().status.configured;
}

export function describeMissing(): string[] {
  return buildStatus().status.missing;
}

export function getEngineConfigOrThrow(correlationId?: string): EngineConfig {
  const { status, config } = buildStatus();
  if (config) return config;
  const missingList = status.missing.length ? status.missing.join(", ") : "unknown";
  // Use "unavailable" so HTTP maps to 503; the JSON response code is normalized by callers.
  throw new HttpsError("unavailable", `Scan engine not configured. Missing: ${missingList}.`, {
    reason: "scan_engine_not_configured",
    missing: status.missing,
    bucket: status.bucket,
    bucketSource: status.bucketSource,
    projectId: status.projectId,
    correlationId,
    provider: status.provider,
    model: status.model,
    baseUrl: status.baseUrl,
  });
}

export function assertScanEngineConfigured(correlationId?: string): EngineConfig {
  return getEngineConfigOrThrow(correlationId);
}
