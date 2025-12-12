const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

function buildHeaders(apiKey) {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return headers;
}

async function requestChatCompletion(apiKey, params, signal) {
  const body = {
    model: params?.model,
    temperature: params?.temperature,
    messages: params?.messages,
  };
  if (params?.user) {
    body.user = params.user;
  }

  const response = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: buildHeaders(apiKey),
    body: JSON.stringify(body),
    signal,
  });

  const text = await response.text().catch(() => "");
  if (!response.ok) {
    const error = new Error("openai_request_failed");
    error.status = response.status;
    error.body = text;
    throw error;
  }

  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

class OpenAI {
  constructor(options = {}) {
    this.apiKey = options.apiKey ?? "";
    this.chat = {
      completions: {
        create: (params = {}) =>
          requestChatCompletion(this.apiKey, params, params.signal),
      },
    };
  }
}

export default OpenAI;
