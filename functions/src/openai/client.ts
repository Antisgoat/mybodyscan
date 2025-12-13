/**
 * Pipeline map — Shared OpenAI client:
 * - Centralizes key loading + retry/timeout logic for every OpenAI call (text + vision).
 * - Provides helpers for plain text completions and structured JSON responses.
 */
import { getOpenAIKey } from "./keys.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_TIMEOUT_MS = 8_000;
const DEFAULT_TEXT_TEMPERATURE = 0.6;
const MAX_TOKENS_CAP = 4_096;

class InvalidModelError extends Error {}

export class OpenAIClientError extends Error {
  code: "openai_missing_key" | "openai_failed";
  status: number;

  constructor(
    code: "openai_missing_key" | "openai_failed",
    status: number,
    message?: string
  ) {
    super(message ?? code);
    this.name = "OpenAIClientError";
    this.code = code;
    this.status = status;
  }
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | {
      type: "image_url";
      image_url: { url: string; detail?: "auto" | "low" | "high" };
    };

export type ChatContent = string | ChatContentPart[];

export type OpenAIChatMessage = {
  role: "system" | "user" | "assistant";
  content: ChatContent;
};

type ChatRequest = {
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  user?: string;
  responseFormat?: "json_object";
  timeoutMs?: number;
};

export type StructuredJsonRequest<T> = {
  systemPrompt: string;
  userContent: ChatContent;
  temperature: number;
  maxTokens: number;
  userId?: string;
  requestId?: string;
  timeoutMs?: number;
  model?: string;
  validate: (payload: unknown) => T;
};

type ChatResponse = {
  content: string;
  usage?: { promptTokens?: number; completionTokens?: number };
};

function buildModelList(candidate?: string): string[] {
  const base = [
    candidate,
    process.env.OPENAI_MODEL,
    "gpt-4o-mini",
    "gpt-4o-mini-2024-07-18",
  ]
    .filter(
      (model): model is string =>
        typeof model === "string" && model.trim().length > 0
    )
    .map((model) => model.trim());

  if (base.length === 0) {
    return ["gpt-4o-mini"];
  }

  return Array.from(new Set(base));
}

function resolveOpenAIKey(): string {
  try {
    return getOpenAIKey();
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      (error as { code?: string }).code === "openai_missing_key"
    ) {
      throw new OpenAIClientError("openai_missing_key", 501);
    }
    throw error;
  }
}

function clampMaxTokens(value?: number): number | undefined {
  if (!Number.isFinite(value)) return undefined;
  const normalized = Math.max(
    1,
    Math.min(MAX_TOKENS_CAP, Math.floor(Number(value)))
  );
  return normalized;
}

function normalizeContent(content: ChatContent): string | ChatContentPart[] {
  if (Array.isArray(content)) {
    const normalized = content
      .map((part) => {
        if (!part || typeof part !== "object") return null;
        if (part.type === "text") {
          const text = typeof part.text === "string" ? part.text : "";
          return { type: "text", text };
        }
        if (part.type === "image_url") {
          const url =
            typeof part.image_url?.url === "string"
              ? part.image_url.url.trim()
              : "";
          if (!url) {
            return null;
          }
          const detail = part.image_url?.detail;
          const normalizedDetail =
            detail === "low" || detail === "high" ? detail : undefined;
          return normalizedDetail
            ? {
                type: "image_url",
                image_url: { url, detail: normalizedDetail },
              }
            : { type: "image_url", image_url: { url } };
        }
        return null;
      })
      .filter(Boolean) as ChatContentPart[];

    return normalized.length ? normalized : "";
  }

  return typeof content === "string" ? content : "";
}

function normalizeMessages(
  messages: OpenAIChatMessage[]
): Array<{ role: string; content: string | ChatContentPart[] }> {
  if (!Array.isArray(messages) || !messages.length) {
    throw new OpenAIClientError("openai_failed", 400, "missing_messages");
  }
  return messages.map((message) => ({
    role: message.role,
    content: normalizeContent(message.content),
  }));
}

async function executeChat(
  model: string,
  key: string,
  request: ChatRequest,
  requestId?: string
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    request.timeoutMs ?? OPENAI_TIMEOUT_MS
  );

  try {
    const body: Record<string, unknown> = {
      model,
      temperature:
        typeof request.temperature === "number" &&
        Number.isFinite(request.temperature)
          ? request.temperature
          : DEFAULT_TEXT_TEMPERATURE,
      messages: normalizeMessages(request.messages),
    };

    const maxTokens = clampMaxTokens(request.maxTokens);
    if (typeof maxTokens === "number") {
      body.max_tokens = maxTokens;
    }
    if (request.user) {
      body.user = request.user;
    }
    if (request.responseFormat === "json_object") {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch(OPENAI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.status === 404) {
      throw new InvalidModelError(`model_not_found_${model}`);
    }

    if (response.status === 429) {
      throw new OpenAIClientError("openai_failed", 429, "status_429");
    }

    if (response.status === 401 || response.status === 403) {
      throw new OpenAIClientError("openai_failed", 401, "status_401");
    }

    if (response.status >= 500) {
      throw new OpenAIClientError(
        "openai_failed",
        500,
        `status_${response.status}`
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new OpenAIClientError(
        "openai_failed",
        response.status,
        text || `status_${response.status}`
      );
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

    return {
      content: message.trim(),
      usage: data?.usage,
    };
  } catch (error) {
    if (
      error instanceof OpenAIClientError ||
      error instanceof InvalidModelError
    ) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new OpenAIClientError("openai_failed", 502, "timeout");
    }

    throw new OpenAIClientError(
      "openai_failed",
      502,
      (error as Error)?.message || "unknown_error"
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function chatOnce(
  prompt: string,
  opts: {
    userId?: string;
    model?: string;
    requestId?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  } = {}
): Promise<string> {
  const trimmed = prompt?.trim();
  if (!trimmed) {
    throw new OpenAIClientError("openai_failed", 400, "empty_prompt");
  }

  const key = resolveOpenAIKey();
  const models = buildModelList(opts.model);
  let lastError: OpenAIClientError | Error | null = null;

  for (const model of models) {
    try {
      const result = await executeChat(
        model,
        key,
        {
          messages: [
            {
              role: "system",
              content:
                "You are MyBodyScan's virtual coach. Respond with concise, motivational guidance in under 150 words. Avoid medical advice.",
            },
            { role: "user", content: trimmed },
          ],
          user: opts.userId,
          temperature:
            typeof opts.temperature === "number"
              ? opts.temperature
              : DEFAULT_TEXT_TEMPERATURE,
          maxTokens: opts.maxTokens ?? 256,
          timeoutMs: opts.timeoutMs ?? OPENAI_TIMEOUT_MS,
        },
        opts.requestId
      );
      return result.content;
    } catch (error) {
      if (error instanceof InvalidModelError) {
        console.warn({
          fn: "openai",
          event: "model_unavailable",
          requestId: opts.requestId ?? null,
          model,
        });
        lastError = error;
        continue;
      }
      lastError = error as Error;
      break;
    }
  }

  if (lastError instanceof OpenAIClientError) {
    throw lastError;
  }

  throw new OpenAIClientError(
    "openai_failed",
    502,
    lastError instanceof Error ? lastError.message : undefined
  );
}

/**
 * Chat using an explicit message list (for threaded conversations).
 * - Keeps the same retry/model fallback behavior as `chatOnce`
 * - Lets callers include prior assistant/user turns for context
 */
export async function chatWithMessages(
  messages: OpenAIChatMessage[],
  opts: {
    userId?: string;
    model?: string;
    requestId?: string;
    temperature?: number;
    maxTokens?: number;
    timeoutMs?: number;
  } = {}
): Promise<{ content: string; usage?: ChatResponse["usage"]; model: string }> {
  const key = resolveOpenAIKey();
  const models = buildModelList(opts.model);
  let lastError: OpenAIClientError | Error | null = null;

  for (const model of models) {
    try {
      const result = await executeChat(
        model,
        key,
        {
          messages,
          user: opts.userId,
          temperature:
            typeof opts.temperature === "number"
              ? opts.temperature
              : DEFAULT_TEXT_TEMPERATURE,
          maxTokens: opts.maxTokens ?? 512,
          timeoutMs: opts.timeoutMs ?? OPENAI_TIMEOUT_MS,
        },
        opts.requestId
      );
      return { content: result.content, usage: result.usage, model };
    } catch (error) {
      if (error instanceof InvalidModelError) {
        console.warn({
          fn: "openai",
          event: "model_unavailable",
          requestId: opts.requestId ?? null,
          model,
        });
        lastError = error;
        continue;
      }
      lastError = error as Error;
      break;
    }
  }

  if (lastError instanceof OpenAIClientError) {
    throw lastError;
  }

  throw new OpenAIClientError(
    "openai_failed",
    502,
    lastError instanceof Error ? lastError.message : undefined
  );
}

export async function structuredJsonChat<T>(
  request: StructuredJsonRequest<T>
): Promise<{ raw: string; data: T }> {
  const systemPrompt = request.systemPrompt?.trim();
  if (!systemPrompt) {
    throw new OpenAIClientError("openai_failed", 400, "missing_system_prompt");
  }

  const key = resolveOpenAIKey();
  const models = buildModelList(request.model);
  let lastError: OpenAIClientError | Error | null = null;

  for (const model of models) {
    try {
      const response = await executeChat(
        model,
        key,
        {
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: request.userContent },
          ],
          user: request.userId,
          temperature: request.temperature,
          maxTokens: request.maxTokens,
          responseFormat: "json_object",
          timeoutMs: request.timeoutMs ?? OPENAI_TIMEOUT_MS,
        },
        request.requestId
      );

      let parsed: unknown;
      try {
        parsed = JSON.parse(response.content);
      } catch (error) {
        throw new OpenAIClientError(
          "openai_failed",
          502,
          "invalid_json_payload"
        );
      }

      let validated: T;
      try {
        validated = request.validate(parsed);
      } catch (error) {
        throw new OpenAIClientError(
          "openai_failed",
          502,
          (error as Error)?.message ?? "invalid_json_schema"
        );
      }

      return { raw: response.content, data: validated };
    } catch (error) {
      if (error instanceof InvalidModelError) {
        console.warn({
          fn: "openai",
          event: "model_unavailable",
          requestId: request.requestId ?? null,
          model,
        });
        lastError = error;
        continue;
      }
      lastError = error as Error;
      break;
    }
  }

  if (lastError instanceof OpenAIClientError) {
    throw lastError;
  }

  throw new OpenAIClientError(
    "openai_failed",
    502,
    lastError instanceof Error ? lastError.message : undefined
  );
}
