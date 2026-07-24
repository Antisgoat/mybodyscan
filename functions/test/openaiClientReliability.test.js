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

  process.env.OPENAI_MODEL = "gpt-4o-mini";
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
      model: "gpt-4o-mini",
    });

    assert.equal(result, "recovered");
    assert.deepEqual(requestedModels, ["gpt-4o-mini", "gpt-4o-mini"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel == null) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  }
});

test("falls back to a current image-capable model when the primary is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalModel = process.env.OPENAI_MODEL;
  const requestedModels = [];
  const requestBodies = [];

  process.env.OPENAI_MODEL = "gpt-4o-mini";
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
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
      validate(payload) {
        assert.deepEqual(payload, { estimate: "ok" });
        return payload;
      },
    });

    assert.deepEqual(result.data, { estimate: "ok" });
    assert.deepEqual(requestedModels, ["gpt-4o-mini", "gpt-4.1-mini"]);
    assert.equal(requestBodies[1].messages[1].content[1].type, "image_url");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalModel == null) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = originalModel;
  }
});
