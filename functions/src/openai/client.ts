/**
 * Pipeline map — Shared OpenAI text client:
 * - Provides retry/timeout logic for chat completions used by coach/workout adjustments.
 * - Centralizes key loading (env or secret) and guards against missing/invalid models.
 */
import { getOpenAIKey } from "./keys.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_TIMEOUT_MS = 8_000;

class InvalidModelError extends Error {}

export class OpenAIClientError extends Error {
  code: "openai_missing_key" | "openai_failed";
  status: number;

  constructor(code: "openai_missing_key" | "openai_failed", status: number, message?: string) {
    super(message ?? code);
    this.name = "OpenAIClientError";
    this.code = code;
    this.status = status;
  }
}

function buildModelList(candidate?: string): string[] {
  const base = [candidate, process.env.OPENAI_MODEL, "gpt-4o-mini", "gpt-4o-mini-2024-07-18"]
    .filter((model): model is string => typeof model === "string" && model.trim().length > 0)
    .map((model) => model.trim());

  if (base.length === 0) {
    return ["gpt-4o-mini"];
  }

  return Array.from(new Set(base));
}

function buildRequestBody(model: string, prompt: string, userId?: string): string {
  const payload: Record<string, unknown> = {
    model,
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

async function executeRequest(model: string, prompt: string, key: string, userId: string | undefined, requestId: string | undefined): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: buildRequestBody(model, prompt, userId),
      signal: controller.signal,
    });

    if (response.status === 404) {
      throw new InvalidModelError(`model_not_found_${model}`);
    }

    if (response.status === 429) {
      throw new OpenAIClientError("openai_failed", 429, `status_${response.status}`);
    }

    if (response.status === 401 || response.status === 403) {
      throw new OpenAIClientError("openai_failed", 401, `status_${response.status}`);
    }

    if (response.status >= 500) {
      throw new OpenAIClientError("openai_failed", 500, `status_${response.status}`);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OpenAIClientError("openai_failed", response.status, text || `status_${response.status}`);
    }

    let data: any;
    try {
      data = await response.json();
    } catch {
      throw new OpenAIClientError("openai_failed", 502, "invalid_json");
    }

    const message = data?.choices?.[0]?.message?.content;
    if (typeof message !== "string" || !message.trim()) {
      throw new OpenAIClientError("openai_failed", 502, "empty_response");
    }

    return message.trim();
  } catch (error) {
    if (error instanceof OpenAIClientError || error instanceof InvalidModelError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenAIClientError("openai_failed", 502, "timeout");
    }

    throw new OpenAIClientError("openai_failed", 502, (error as Error)?.message);
  } finally {
    clearTimeout(timeout);
  }
}

export async function chatOnce(
  prompt: string,
  opts: { userId?: string; model?: string; requestId?: string } = {},
): Promise<string> {
  const trimmed = prompt?.trim();
  if (!trimmed) {
    throw new OpenAIClientError("openai_failed", 400, "empty_prompt");
  }

  let key: string;
  try {
    key = getOpenAIKey();
  } catch (error) {
    if (error && typeof error === "object" && (error as { code?: string }).code === "openai_missing_key") {
      throw new OpenAIClientError("openai_missing_key", 501);
    }
    throw error;
  }
  const models = buildModelList(opts.model);
  let lastError: OpenAIClientError | Error | null = null;

  for (const model of models) {
    try {
      return await executeRequest(model, trimmed, key, opts.userId, opts.requestId);
    } catch (error) {
      if (error instanceof InvalidModelError) {
        console.warn({ fn: "openai", event: "model_unavailable", requestId: opts.requestId ?? null, model });
        lastError = error;
        continue;
      }

      if (error instanceof OpenAIClientError) {
        lastError = error;
      } else {
        lastError = error as Error;
      }
      break;
    }
  }

  if (lastError instanceof OpenAIClientError) {
    throw lastError;
  }

  throw new OpenAIClientError(
    "openai_failed",
    502,
    lastError instanceof Error ? lastError.message : undefined,
  );
}
