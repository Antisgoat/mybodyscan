export function getVisionModel(): string {
  return process.env.OPENAI_VISION_MODEL || "o4-mini";
}
