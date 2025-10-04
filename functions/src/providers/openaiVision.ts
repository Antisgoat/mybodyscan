export type VisionResult = {
  bodyFatPercent: number | null;
  bmi: number | null;
  weight: number | null;
  reasoning?: string;
};

export async function runOpenAIVisionScan(args: {
  imageUrl: string;
  heightCm?: number;
  weightKg?: number;
  userHints?: string;
  model?: string; // default from env
}): Promise<VisionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("openai_api_key_missing");
  }

  const model = args.model || process.env.OPENAI_VISION_MODEL || "gpt-4o";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    // Structured output schema
    const jsonSchema = {
      name: "VisionResult",
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          bodyFatPercent: { type: ["number", "null"], minimum: 0, maximum: 70 },
          bmi: { type: ["number", "null"], minimum: 8, maximum: 80 },
          weight: { type: ["number", "null"], minimum: 0, maximum: 600 },
          reasoning: { type: ["string", "null"] },
        },
        required: ["bodyFatPercent", "bmi", "weight"],
      },
      strict: true,
    } as const;

    const systemPrompt = [
      "You estimate body composition from a single full-body photo.",
      "Return concise, safe results as JSON only.",
      "Do not give medical advice. Use neutral language.",
    ].join(" ");

    const taskText = [
      "Estimate body fat percentage.",
      args.heightCm ? `Height: ${Number(args.heightCm).toFixed(1)} cm.` : "",
      args.weightKg ? `Weight: ${Number(args.weightKg).toFixed(1)} kg.` : "",
      args.userHints ? `Hints: ${args.userHints}` : "",
      "Respond with fields bodyFatPercent (0-70, number), bmi (number or null), weight (kg number or null), reasoning (short, non-medical).",
    ]
      .filter(Boolean)
      .join(" ");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "text", text: systemPrompt }] },
          {
            role: "user",
            content: [
              { type: "input_text", text: taskText },
              { type: "input_image", image_url: args.imageUrl },
            ],
          },
        ],
        response_format: { type: "json_schema", json_schema: jsonSchema },
        max_output_tokens: 300,
      }),
    });

    if (!response.ok) {
      const errText = await safeText(response);
      console.error("openai_vision_error", { status: response.status, body: errText?.slice?.(0, 500) });
      throw new Error("vision_request_failed");
    }
    const data: any = await response.json().catch(() => ({}));

    // Prefer structured output
    const parsed: any = data?.output_parsed || tryParseJson(data?.output_text) || {};

    const bodyFatPercent = sanitizeNumber(parsed?.bodyFatPercent, 0, 70);
    const bmi = sanitizeNumber(parsed?.bmi, 8, 80);
    const weight = sanitizeNumber(parsed?.weight, 0, 600);
    const reasoning = typeof parsed?.reasoning === "string" ? parsed.reasoning.trim().slice(0, 400) : undefined;

    return { bodyFatPercent, bmi, weight, reasoning };
  } catch (error) {
    if ((error as any)?.name === "AbortError") {
      console.error("openai_vision_timeout");
    } else {
      console.error("openai_vision_exception", { message: (error as Error)?.message });
    }
    throw new Error("vision_unavailable");
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeNumber(value: unknown, min: number, max: number): number | null {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const clamped = Math.max(min, Math.min(max, num));
  return Number(clamped.toFixed(1));
}

function tryParseJson(text: unknown): any | null {
  const str = typeof text === "string" ? text : "";
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
