import Replicate from "replicate";
import type { ScanInput, ScanOutput, ScanProvider } from "./scanProvider.js";

/**
 * Provider that calls Replicate's pose model. Results are placeholder metrics
 * until the model output is fully parsed.
 */
export class ReplicateProvider implements ScanProvider {
  async analyze(input: ScanInput): Promise<ScanOutput> {
    const apiKey = process.env.REPLICATE_API_KEY;
    const model = process.env.REPLICATE_MODEL || "cjwbw/ultralytics-pose:9d045f";
    if (!apiKey) {
      throw new Error("REPLICATE_API_KEY not configured");
    }
    if (!input.frontUrl) {
      throw new Error("frontUrl required");
    }
    const replicate = new Replicate({ auth: apiKey });
    try {
      await replicate.run(model, { input: { image: input.frontUrl } });
    } catch (err) {
      // swallow errors from the external model but return stub metrics
    }

    const heightIn = input.heightIn ?? 70;
    const weightLb = input.weightLb ?? 180;
    const bmi = (weightLb / (heightIn * heightIn)) * 703;

    return {
      bfPercent: 20, // placeholder until model parsing is implemented
      bmi,
      weightLb,
      provider: "replicate",
      summary: "Replicate model placeholder result",
    };
  }
}
