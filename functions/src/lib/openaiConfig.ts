import { defineString } from "firebase-functions/params";
import { HttpsError } from "firebase-functions/v2/https";
import { openAiSecretParam } from "../openai/keys.js";

export type OpenAIEnvConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  provider: string;
};

const openAiModelParam = defineString("OPENAI_MODEL");
const openAiBaseUrlParam = defineString("OPENAI_BASE_URL");
const openAiProviderParam = defineString("OPENAI_PROVIDER");

function readParam(param: { value(): string | undefined }): string {
  try {
    const value = param.value();
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function resolveApiKey(): string {
  const envKey = (process.env.OPENAI_API_KEY || "").trim();
  if (envKey) return envKey;
  const secretValue = readParam(openAiSecretParam);
  return secretValue;
}

function resolveModel(): string {
  const envModel = (process.env.OPENAI_MODEL || "").trim();
  if (envModel) return envModel;
  const paramModel = readParam(openAiModelParam);
  if (paramModel) return paramModel;
  return "gpt-4o-mini";
}

function resolveBaseUrl(): string {
  const envBase = (process.env.OPENAI_BASE_URL || "").trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const paramBase = readParam(openAiBaseUrlParam);
  const baseUrl = paramBase ? paramBase.replace(/\/+$/, "") : "https://api.openai.com";
  return baseUrl;
}

function resolveProvider(): string {
  const envProvider = (process.env.OPENAI_PROVIDER || "").trim();
  if (envProvider) return envProvider.toLowerCase();
  const paramProvider = readParam(openAiProviderParam);
  if (paramProvider) return paramProvider.toLowerCase();
  return "openai";
}

export function readOpenAIEnv():
  | { config: OpenAIEnvConfig; missing: string[] }
  | { config: null; missing: string[] } {
  const apiKey = resolveApiKey();
  const model = resolveModel();
  const baseUrl = resolveBaseUrl();
  const provider = resolveProvider();

  const missing: string[] = [];
  if (!apiKey) missing.push("OPENAI_API_KEY");

  if (missing.length) {
    return { config: null, missing };
  }

  return {
    config: {
      apiKey,
      model,
      baseUrl,
      provider,
    },
    missing,
  };
}

export function assertOpenAIConfig(correlationId?: string): OpenAIEnvConfig {
  const { config, missing } = readOpenAIEnv();
  if (config) return config;
  const message =
    missing.includes("OPENAI_API_KEY") || missing.includes("OPENAI_MODEL")
      ? "Scan engine not configured. Set OPENAI_API_KEY (and optionally OPENAI_MODEL) in Cloud Functions."
      : `Scan engine not configured. Missing: ${missing.join(", ")}`;
  throw new HttpsError("unavailable", message, {
    reason: "scan_engine_not_configured",
    missing,
    correlationId,
  });
}
