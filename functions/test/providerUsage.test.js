import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProviderUsage } from "../lib/openai/usage.js";
import { chatWithMessages } from "../lib/openai/client.js";

test("normalizes chat usage and cached input counts", () => {
  assert.deepEqual(
    normalizeProviderUsage({
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
      prompt_tokens_details: { cached_tokens: 40 },
    }),
    {
      promptTokens: 100,
      completionTokens: 20,
      totalTokens: 120,
      cachedInputTokens: 40,
    }
  );
});
test("normalizes image input and output accounting", () => {
  assert.deepEqual(
    normalizeProviderUsage({
      input_tokens: 100,
      output_tokens: 200,
      total_tokens: 300,
      input_tokens_details: { text_tokens: 20, image_tokens: 80 },
    }),
    {
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
      inputTextTokens: 20,
      inputImageTokens: 80,
    }
  );
});
test("unknown or invalid usage never becomes a zero-dollar claim", () => {
  for (const raw of [
    undefined,
    null,
    {},
    [],
    { prompt_tokens: -1, completion_tokens: "20", total_tokens: NaN },
  ])
    assert.equal(normalizeProviderUsage(raw), undefined);
  assert.deepEqual(
    normalizeProviderUsage({ prompt_tokens: 0, completion_tokens: 0 }),
    { promptTokens: 0, completionTokens: 0 }
  );
});
test("chat returns actual token counts and logs no conversation content", async () => {
  const fetch = globalThis.fetch;
  const info = console.info;
  const logs = [];
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        model: "test-model",
        choices: [{ message: { content: "PRIVATE ANSWER" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
      { status: 200, headers: { "x-request-id": "test-request" } }
    );
  console.info = (value) => logs.push(value);
  try {
    const result = await chatWithMessages(
      [{ role: "user", content: "PRIVATE PROMPT" }],
      { apiKey: "fake-key", model: "test-model", requestId: "local-test" }
    );
    assert.deepEqual(result.usage, {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    assert.equal(
      logs.filter((log) => log.event === "provider_usage").length,
      1
    );
    assert.equal(
      logs.find((log) => log.event === "provider_usage").providerRequestId,
      "test-request"
    );
    assert.doesNotMatch(JSON.stringify(logs), /PRIVATE|fake-key/);
  } finally {
    globalThis.fetch = fetch;
    console.info = info;
  }
});
