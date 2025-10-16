import { z } from "zod";
import type { ValidationResult } from "./types.js";

export const nutritionSearchSchema = z.object({
  q: z.string().min(1).max(100).optional(),
  query: z.string().min(1).max(100).optional(),
}).refine(
  (data) => data.q || data.query,
  {
    message: "Either 'q' or 'query' parameter is required",
    path: ["q"],
  }
);

export function validateNutritionSearchPayload(input: unknown): ValidationResult<{
  query: string;
}> {
  try {
    const result = nutritionSearchSchema.parse(input);
    const query = result.q || result.query || "";
    return {
      success: true,
      data: { query },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
      };
    }
    return {
      success: false,
      errors: ["Invalid request format"],
    };
  }
}