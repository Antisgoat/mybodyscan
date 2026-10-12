import assert from "node:assert/strict";
import test from "node:test";

import { chatOnce, structuredJsonChat } from "../lib/openai/client.js";

function jsonResponse(content) {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    }
  );
}

test("retries a transient provider error on the same model", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.OPENAI_MODEL;
  const requestedModels = [];
  let calls = 0;

  process.env.OPENAI_MODEL = "gpt-6-luna";
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    requestedModels.push(JSON.parse(init.body).model);
    if (calls === 1) {
      return new Response("temporary upstream failure", { status: 502 });
    }
    return jsonResponse("recovered");
  };

  try {
    const result = await chatOnce("Give me one safe recovery tip.", {
      apiKey: "test-key",
      model: "gpt-6-luna",
    });

    assert.equal(result, "recovered");
    assert.deepEqual(requestedModels, ["gpt-6-luna", "gpt-6-luna"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel == null) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  }
});

test("falls back from a retired override to the current image-capable model", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.OPENAI_MODEL;
  const requestedModels = [];
  const requestBodies = [];
  const requestedUrls = [];

  process.env.OPENAI_MODEL = "gpt-4o-mini";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requestedUrls.push(String(url));
    requestBodies.push(body);
    requestedModels.push(body.model);
    if (body.model === "gpt-4o-mini") {
      return new Response(
        JSON.stringify({ error: { message: "model not found" } }),
        { status: 404, headers: { "content-type": "application/json" } }
      );
    }
    return jsonResponse(JSON.stringify({ estimate: "ok" }));
  };

  try {
    const result = await structuredJsonChat({
      systemPrompt: "Return JSON.",
      userContent: [
        { type: "text", text: "Analyze this image." },
        {
          type: "image_url",
          image_url: {
            url: "data:image/png;base64,dGVzdA==",
            detail: "low",
          },
        },
      ],
      temperature: 0.2,
      maxTokens: 128,
      apiKey: "test-key",
      model: "gpt-4o-mini",
      userId: "firebase-user-123",
      baseUrl: "https://api.openai.com/v1/",
      validate(payload) {
        assert.deepEqual(payload, { estimate: "ok" });
        return payload;
      },
    });

    assert.deepEqual(result.data, { estimate: "ok" });
    assert.deepEqual(requestedModels, ["gpt-4o-mini", "gpt-6.1-sol"]);
    assert.equal(requestBodies[1].messages[1].content[1].type, "image_url");
    assert.equal(requestBodies[1].reasoning_effort, "low");
    assert.equal(requestBodies[1].max_completion_tokens, 128);
    assert.equal(requestBodies[1].temperature, undefined);
    assert.equal(requestBodies[1].safety_identifier, "firebase-user-123");
    assert.equal(requestBodies[1].user, undefined);
    assert.deepEqual(requestedUrls, [
      "https://api.openai.com/v1/chat/completions",
      "https://api.openai.com/v1/chat/completions",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel == null) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  }
});

test("sends Astra requests with supported reasoning parameters", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return jsonResponse(JSON.stringify({ estimate: "ok" }));
  };

  try {
    await structuredJsonChat({
      systemPrompt: "Return JSON.",
      userContent: "Analyze consistently.",
      temperature: 0.2,
      maxTokens: 512,
      reasoningEffort: "medium",
      apiKey: "test-key",
      model: "gpt-6-astra",
      userId: "firebase-user-456",
      validate(payload) {
        return payload;
      },
    });

    assert.equal(requestBody.model, "gpt-6-astra");
    assert.equal(requestBody.reasoning_effort, "medium");
    assert.equal(requestBody.max_completion_tokens, 512);
    assert.equal(requestBody.temperature, undefined);
    assert.equal(requestBody.safety_identifier, "firebase-user-456");
    assert.deepEqual(requestBody.response_format, { type: "json_object" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sends GPT-6.1 Sol requests without unsupported sampling parameters", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return jsonResponse(JSON.stringify({ plan: "ok" }));
  };

  try {
    await structuredJsonChat({
      systemPrompt: "Return JSON.",
      userContent: "Create a structured plan.",
      temperature: 0.2,
      maxTokens: 512,
      reasoningEffort: "medium",
      apiKey: "test-key",
      model: "gpt-6.1-sol",
      userId: "firebase-user-789",
      validate(payload) {
        return payload;
      },
    });

    assert.equal(requestBody.model, "gpt-6.1-sol");
    assert.equal(requestBody.reasoning_effort, "medium");
    assert.equal(requestBody.max_completion_tokens, 512);
    assert.equal(requestBody.temperature, undefined);
    assert.equal(requestBody.safety_identifier, "firebase-user-789");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("keeps routine GPT-6 Luna chat on no reasoning for low latency", async () => {
  const originalFetch = globalThis.fetch;
  let requestBody;
  globalThis.fetch = async (_url, init) => {
    requestBody = JSON.parse(init.body);
    return jsonResponse("Keep two reps in reserve today.");
  };

  try {
    await chatOnce("How hard should this set feel?", {
      apiKey: "test-key",
      model: "gpt-6-luna",
      userId: "firebase-user-999",
    });

    assert.equal(requestBody.model, "gpt-6-luna");
    assert.equal(requestBody.reasoning_effort, "none");
    assert.equal(requestBody.temperature, undefined);
    assert.equal(requestBody.safety_identifier, "firebase-user-999");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
