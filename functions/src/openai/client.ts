/**
 * Pipeline map — Shared OpenAI client:
 * - Centralizes key loading + retry/timeout logic for every OpenAI call (text + vision).
 * - Provides helpers for plain text completions and structured JSON responses.
 * - Tolerates model/API parameter differences so production scans do not fail on
 *   max_tokens / max_completion_tokens / temperature / response_format drift.
 */
import { getOpenAIKey } from "./keys.js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const OPENAI_TIMEOUT_MS = 8_000;
const DEFAULT_TEXT_TEMPERATURE = 0.6;
const MAX_TOKENS_CAP = 4_096;
const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const FALLBACK_OPENAI_MODEL = "gpt-4.1-mini";
const MAX_TRANSIENT_RETRIES = 1;
const TRANSIENT_RETRY_DELAY_MS = 250;

class InvalidModelError extends Error {}

export class OpenAIClientError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message?: string) {
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
  apiKey?: string;
  baseUrl?: string;
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
    DEFAULT_OPENAI_MODEL,
    FALLBACK_OPENAI_MODEL,
  ]
    .filter(
      (model): model is string =>
        typeof model === "string" && model.trim().length > 0
    )
    .map((model) => model.trim());

  if (base.length === 0) {
    return [DEFAULT_OPENAI_MODEL, FALLBACK_OPENAI_MODEL];
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

function resolveEndpoint(customBaseUrl?: string): string {
  const base =
    (customBaseUrl || process.env.OPENAI_BASE_URL || "").trim() ||
    OPENAI_ENDPOINT;
  if (base.includes("/v1/chat/completions")) {
    return base;
  }
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}/v1/chat/completions`;
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

function stableBodyKey(body: Record<string, unknown>): string {
  return JSON.stringify(body, Object.keys(body).sort());
}

function buildChatBodies(
  model: string,
  request: ChatRequest
): Record<string, unknown>[] {
  const maxTokens = clampMaxTokens(request.maxTokens);
  const base: Record<string, unknown> = {
    model,
    messages: normalizeMessages(request.messages),
  };
  if (request.user) base.user = request.user;

  const withTemperature: Record<string, unknown> = {
    ...base,
    temperature:
      typeof request.temperature === "number" &&
      Number.isFinite(request.temperature)
        ? request.temperature
        : DEFAULT_TEXT_TEMPERATURE,
  };
  if (typeof maxTokens === "number") withTemperature.max_tokens = maxTokens;
  if (request.responseFormat === "json_object") {
    withTemperature.response_format = { type: "json_object" };
  }

  const candidates: Record<string, unknown>[] = [withTemperature];

  // Some current models reject max_tokens and require max_completion_tokens.
  if (typeof maxTokens === "number") {
    const alt = { ...withTemperature };
    delete alt.max_tokens;
    alt.max_completion_tokens = maxTokens;
    candidates.push(alt);
  }

  // Some models only accept default temperature.
  candidates.push(
    ...candidates.map((candidate) => {
      const next = { ...candidate };
      delete next.temperature;
      return next;
    })
  );

  // Some endpoints/models reject response_format=json_object even when the prompt
  // requests JSON. Keep the prompt strict and retry without the explicit parameter.
  candidates.push(
    ...candidates.map((candidate) => {
      const next = { ...candidate };
      delete next.response_format;
      return next;
    })
  );

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = stableBodyKey(candidate);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shouldTryNextBody(status: number, text: string): boolean {
  if (status !== 400 && status !== 422) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("unsupported") ||
    lower.includes("unrecognized") ||
    lower.includes("unknown parameter") ||
    lower.includes("invalid parameter") ||
    lower.includes("max_tokens") ||
    lower.includes("max_completion_tokens") ||
    lower.includes("temperature") ||
    lower.includes("response_format")
  );
}

function isModelUnavailable(status: number, text: string): boolean {
  const lower = text.toLowerCase();
  return (
    status === 404 ||
    ((status === 400 || status === 422) &&
      lower.includes("model") &&
      (lower.includes("not found") ||
        lower.includes("does not exist") ||
        lower.includes("doesn't exist") ||
        lower.includes("not supported") ||
        lower.includes("unsupported model")))
  );
}

function extractMessage(data: any): string | null {
  const message = data?.choices?.[0]?.message?.content;
  if (typeof message === "string" && message.trim()) return message.trim();
  if (Array.isArray(message)) {
    const joined = message
      .map((part: any) =>
        typeof part?.text === "string"
          ? part.text
          : typeof part?.content === "string"
            ? part.content
            : ""
      )
      .join("\n")
      .trim();
    return joined || null;
  }
  return null;
}

async function executeChat(
  model: string,
  key: string,
  request: ChatRequest,
  requestId?: string,
  baseUrl?: string
): Promise<ChatResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    request.timeoutMs ?? OPENAI_TIMEOUT_MS
  );

  try {
    const endpoint = resolveEndpoint(baseUrl);
    const bodies = buildChatBodies(model, request);
    let lastBadRequest: string | null = null;

    for (const body of bodies) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

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
        if (isModelUnavailable(response.status, text)) {
          throw new InvalidModelError(`model_unavailable_${model}`);
        }
        lastBadRequest = text || `status_${response.status}`;
        if (shouldTryNextBody(response.status, lastBadRequest)) {
          console.warn({
            fn: "openai",
            event: "retrying_with_compatible_parameters",
            requestId: requestId ?? null,
            model,
            status: response.status,
            reason: lastBadRequest.slice(0, 160),
          });
          continue;
        }
        throw new OpenAIClientError(
          "openai_failed",
          response.status,
          lastBadRequest
        );
      }

      let data: any;
      try {
        data = await response.json();
      } catch {
        throw new OpenAIClientError("openai_failed", 502, "invalid_json");
      }

      const message = extractMessage(data);
      if (!message) {
        throw new OpenAIClientError("openai_failed", 502, "empty_response");
      }

      return {
        content: message,
        usage: data?.usage,
      };
    }

    throw new OpenAIClientError(
      "openai_failed",
      400,
      lastBadRequest || "invalid_request"
    );
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

function shouldRetrySameModel(error: unknown): boolean {
  if (!(error instanceof OpenAIClientError)) return false;
  if (error.message === "timeout") return false;
  return error.status === 429 || error.status >= 500;
}

function waitForTransientRetry(attempt: number): Promise<void> {
  const delayMs = TRANSIENT_RETRY_DELAY_MS * Math.max(1, attempt);
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function executeChatWithRetry(
  model: string,
  key: string,
  request: ChatRequest,
  requestId?: string,
  baseUrl?: string
): Promise<ChatResponse> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await executeChat(model, key, request, requestId, baseUrl);
    } catch (error) {
      if (attempt >= MAX_TRANSIENT_RETRIES || !shouldRetrySameModel(error)) {
        throw error;
      }
      console.warn({
        fn: "openai",
        event: "retrying_transient_failure",
        requestId: requestId ?? null,
        model,
        attempt: attempt + 1,
        status: error instanceof OpenAIClientError ? error.status : null,
        message: (error as Error)?.message,
      });
      await waitForTransientRetry(attempt + 1);
    }
  }
}

function shouldTryNextModel(error: unknown): boolean {
  if (error instanceof InvalidModelError) return true;
  if (error instanceof OpenAIClientError) {
    return error.status >= 500 || error.status === 429;
  }
  return false;
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
    apiKey?: string;
    baseUrl?: string;
  } = {}
): Promise<string> {
  const trimmed = prompt?.trim();
  if (!trimmed) {
    throw new OpenAIClientError("openai_failed", 400, "empty_prompt");
  }

  const key = opts.apiKey ?? resolveOpenAIKey();
  const baseUrl = opts.baseUrl;
  const models = buildModelList(opts.model);
  let lastError: OpenAIClientError | Error | null = null;

  for (const model of models) {
    try {
      const result = await executeChatWithRetry(
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
        opts.requestId,
        baseUrl
      );
      return result.content;
    } catch (error) {
      console.warn({
        fn: "openai",
        event: "model_attempt_failed",
        requestId: opts.requestId ?? null,
        model,
        message: (error as Error)?.message,
      });
      lastError = error as Error;
      if (shouldTryNextModel(error)) continue;
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
    apiKey?: string;
    baseUrl?: string;
  } = {}
): Promise<{ content: string; usage?: ChatResponse["usage"]; model: string }> {
  const key = opts.apiKey ?? resolveOpenAIKey();
  const baseUrl = opts.baseUrl;
  const models = buildModelList(opts.model);
  let lastError: OpenAIClientError | Error | null = null;

  for (const model of models) {
    try {
      const result = await executeChatWithRetry(
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
        opts.requestId,
        baseUrl
      );
      return { content: result.content, usage: result.usage, model };
    } catch (error) {
      console.warn({
        fn: "openai",
        event: "model_attempt_failed",
        requestId: opts.requestId ?? null,
        model,
        message: (error as Error)?.message,
      });
      lastError = error as Error;
      if (shouldTryNextModel(error)) continue;
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

  const key = request.apiKey ?? resolveOpenAIKey();
  const baseUrl = request.baseUrl;
  const models = buildModelList(request.model);
  let lastError: OpenAIClientError | Error | null = null;

  for (const model of models) {
    try {
      const response = await executeChatWithRetry(
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
        request.requestId,
        baseUrl
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
      console.warn({
        fn: "openai",
        event: "structured_model_attempt_failed",
        requestId: request.requestId ?? null,
        model,
        message: (error as Error)?.message,
      });
      lastError = error as Error;
      if (shouldTryNextModel(error)) continue;
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
