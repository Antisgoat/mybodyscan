import OpenAI from "openai";

type ConfidenceLevel = "low" | "medium" | "high";

export type VisionInputs = {
  weightLb?: number;
  heightIn?: number;
  age?: number;
  sex?: "male" | "female";
};

export type VisionResult = {
  bfPercent: number;
  low: number;
  high: number;
  confidence: ConfidenceLevel;
  notes: string;
};

function buildUserContext(inputs?: VisionInputs): string {
  if (!inputs) return "No additional numeric context provided.";
  const parts: string[] = [];
  if (inputs.weightLb != null) parts.push(`Weight: ${Number(inputs.weightLb).toFixed(1)} lb`);
  if (inputs.heightIn != null) parts.push(`Height: ${Number(inputs.heightIn).toFixed(1)} in`);
  if (inputs.age != null) parts.push(`Age: ${inputs.age} years`);
  if (inputs.sex) parts.push(`Sex: ${inputs.sex}`);
  return parts.length ? parts.join("; ") : "No additional numeric context provided.";
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function normalizeConfidence(raw: unknown): ConfidenceLevel {
  if (raw === "high" || raw === "medium" || raw === "low") return raw;
  const text = typeof raw === "string" ? raw.toLowerCase() : "";
  if (text.includes("high")) return "high";
  if (text.includes("medium")) return "medium";
  if (text.includes("low")) return "low";
  return "low";
}

function sanitizeNotes(notes: unknown): string {
  if (typeof notes !== "string") return "Visual estimate only. Not medical advice.";
  const trimmed = notes.trim();
  const withEstimate = trimmed.toLowerCase().includes("estimate")
    ? trimmed
    : `${trimmed}${trimmed.endsWith(".") ? "" : "."} Estimate only.`;
  const withDisclaimer = withEstimate.toLowerCase().includes("medical")
    ? withEstimate
    : `${withEstimate} Not medical advice.`;
  return withDisclaimer.slice(0, 400);
}

function parseVisionJson(text: string): VisionResult {
  let body = text.trim();
  const fenced = body.match(/```json([\s\S]*?)```/i);
  if (fenced) body = fenced[1].trim();
  else if (body.startsWith("```")) {
    const generic = body.match(/```([\s\S]*?)```/);
    if (generic) body = generic[1].trim();
  }
  const parsed = JSON.parse(body);
  const bf = clamp(Number(parsed?.bfPercent ?? parsed?.bodyFat ?? parsed?.body_fat), 3, 60);
  const lowRaw = Number(parsed?.low ?? parsed?.lower ?? parsed?.min);
  const highRaw = Number(parsed?.high ?? parsed?.upper ?? parsed?.max);
  let low = clamp(lowRaw || bf - 2, 3, 60);
  let high = clamp(highRaw || bf + 2, 3, 60);
  if (low > high) {
    const swap = low;
    low = high;
    high = swap;
  }
  const confidence = normalizeConfidence(parsed?.confidence);
  const notes = sanitizeNotes(parsed?.notes ?? parsed?.summary ?? "");
  return {
    bfPercent: Number(bf.toFixed(1)),
    low: Number(low.toFixed(1)),
    high: Number(high.toFixed(1)),
    confidence,
    notes,
  };
}

export async function analyzeBodyComposition(
  imageUrls: string[],
  inputs?: VisionInputs,
  opts?: { model?: string }
): Promise<VisionResult> {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new Error("no_images");
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err: any = new Error("missing_api_key");
    err.status = 503;
    throw err;
  }

  const client = new OpenAI({ apiKey });
  const model = opts?.model || process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";

  const systemPrompt =
    "You are a body-composition assistant. Estimate body fat percentage from photographs. Provide only the requested JSON.";
  const userText = [
    "Estimate the person's body fat percentage based on the attached front, back, left, and right photos.",
    "Use visual cues and any provided context.",
    'Respond with compact JSON matching: {"bfPercent": number, "low": number, "high": number, "confidence": "low"|"medium"|"high", "notes": string}.',
    "Do not mention medical conditions. Notes must remind that this is an estimate, not medical advice.",
    `Context: ${buildUserContext(inputs)}`,
    "Return JSON only without markdown or additional commentary.",
  ].join("\n");

  const content: any[] = [{ type: "text", text: userText }];
  for (const url of imageUrls) {
    content.push({ type: "image_url", image_url: { url, detail: "high" } });
  }

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    max_tokens: 400,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content },
    ],
  });

  const text = completion.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("no_content");
  }
  return parseVisionJson(text);
}
