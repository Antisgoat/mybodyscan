import { defineSecret } from "firebase-functions/params";

export const openAiSecretParam = defineSecret("OPENAI_API_KEY");

export function getOpenAIKey(): string {
  const envKey = (process.env.OPENAI_API_KEY || "").trim();
  if (envKey) {
    return envKey;
  }

  try {
    const secretValue = openAiSecretParam.value();
    if (typeof secretValue === "string") {
      const trimmed = secretValue.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  } catch {
    // Secret not available in this environment
  }

  throw { code: "openai_missing_key" as const };
}
