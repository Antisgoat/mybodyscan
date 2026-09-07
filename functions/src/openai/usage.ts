export type ProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedInputTokens?: number;
  inputTextTokens?: number;
  inputImageTokens?: number;
};

function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

/** Normalize provider fields without turning missing billing data into zero. */
export function normalizeProviderUsage(
  raw: unknown
): ProviderUsage | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const data = raw as Record<string, any>;
  const fields: ProviderUsage = {
    promptTokens: tokenCount(data.prompt_tokens ?? data.input_tokens),
    completionTokens: tokenCount(data.completion_tokens ?? data.output_tokens),
    totalTokens: tokenCount(data.total_tokens),
    cachedInputTokens: tokenCount(
      data.prompt_tokens_details?.cached_tokens ??
        data.input_tokens_details?.cached_tokens
    ),
    inputTextTokens: tokenCount(data.input_tokens_details?.text_tokens),
    inputImageTokens: tokenCount(data.input_tokens_details?.image_tokens),
  };
  const known = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  );
  return Object.keys(known).length ? known : undefined;
}
