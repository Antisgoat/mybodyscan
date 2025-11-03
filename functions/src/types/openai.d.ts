declare module "openai" {
  type ChatMessage = {
    role: string;
    content: string;
  };

  interface ChatCompletionRequest {
    model: string;
    temperature?: number;
    messages?: ChatMessage[];
    user?: string;
    signal?: AbortSignal;
  }

  interface ChatCompletionChoice {
    message?: { content?: string };
  }

  interface ChatCompletionResponse {
    choices?: ChatCompletionChoice[];
  }

  export default class OpenAI {
    constructor(options?: { apiKey?: string });
    chat: {
      completions: {
        create(params: ChatCompletionRequest): Promise<ChatCompletionResponse>;
      };
    };
  }
}
