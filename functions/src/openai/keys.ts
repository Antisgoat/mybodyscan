import { defineSecret } from "firebase-functions/params";

export const openAiSecretParam = defineSecret("OPENAI_API_KEY");

function readSecretValue(): string | null {
  try {
    const value = openAiSecretParam.value();
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  } catch {
    // Secret not available in this environment
  }
  return null;
}

export function getOpenAIKey(): string {
  const secret = readSecretValue();
  if (secret) {
    return secret;
  }

  const envKey = (process.env.OPENAI_API_KEY || "").trim();
  if (envKey) {
    return envKey;
  }

  throw { code: "openai_missing_key" as const };
}
