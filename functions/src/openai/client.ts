import { HttpError } from "../util/http.js";
import { readSecret } from "../util/env.js";

const OPENAI_TIMEOUT_MS = 20_000;
const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

export function getOpenAIKey(): { present: boolean; value?: string } {
  return readSecret("OPENAI_API_KEY", []);
}

function buildRequestBody(prompt: string, userId?: string): string {
  const payload: Record<string, unknown> = {
    model: OPENAI_MODEL,
    temperature: 0.6,
    max_tokens: 256,
    messages: [
      {
        role: "system",
        content:
          "You are MyBodyScan's virtual coach. Respond with concise, motivational guidance in under 150 words. Avoid medical advice.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  if (userId) {
    payload.user = userId;
  }

  return JSON.stringify(payload);
}

export async function chatSimple(prompt: string, opts: { userId?: string } = {}): Promise<string> {
  const secret = getOpenAIKey();
  if (!secret.present || !secret.value) {
    throw new HttpError(501, "openai_missing_key");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret.value}`,
      },
      body: buildRequestBody(prompt, opts.userId),
      signal: controller.signal,
    });

    if (response.status === 429 || response.status >= 500) {
      throw new HttpError(502, "openai_failed");
    }

    if (!response.ok) {
      throw new HttpError(response.status, "openai_failed");
    }

    let data: unknown;
    try {
      data = await response.json();
    } catch (error) {
      throw new HttpError(502, "openai_failed", "invalid_json");
    }

    const message = (data as any)?.choices?.[0]?.message?.content;
    if (typeof message !== "string" || !message.trim()) {
      throw new HttpError(502, "openai_failed", "no_content");
    }

    return message.trim();
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(502, "openai_failed", "timeout");
    }

    throw new HttpError(502, "openai_failed");
  } finally {
    clearTimeout(timeout);
  }
}
