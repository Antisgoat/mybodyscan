import { defineSecret } from "firebase-functions/params";
import type { ScanInput, ScanOutput, ScanProvider } from "./scanProvider.js";

const openaiKey = defineSecret("OPENAI_API_KEY");

export class OpenAIProvider implements ScanProvider {
  async analyze(input: ScanInput): Promise<ScanOutput> {
    // Stub implementation; does not call external API yet.
    // Access the secret so that it is provisioned at deploy time.
    void openaiKey.value();
    const heightIn = input.heightIn ?? 70;
    const weightLb = input.weightLb ?? 180;
    return {
      bfPercent: 20,
      bmi: (weightLb / (heightIn * heightIn)) * 703,
      weightLb,
      provider: "openai",
      confidence: 0.5,
      summary: "OpenAI provider stub result",
    };
  }
}
