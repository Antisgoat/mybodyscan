import type { ScanInput, ScanOutput, ScanProvider } from "./scanProvider.js";

function computeBmi(heightIn: number, weightLb: number): number {
  return (weightLb / (heightIn * heightIn)) * 703;
}

function estimateBodyFat(sex: "male" | "female", bmi: number): number {
  // Deurenberg formula as a stand-in for the US Navy method.
  const sexFlag = sex === "male" ? 1 : 0;
  const age = 30; // placeholder age assumption
  return 1.2 * bmi + 0.23 * age - 10.8 * sexFlag - 5.4;
}

export class PlaceholderProvider implements ScanProvider {
  async analyze(input: ScanInput): Promise<ScanOutput> {
    const heightIn = input.heightIn ?? 70;
    const weightLb = input.weightLb ?? 180;
    const sex = input.sex ?? "male";
    const bmi = computeBmi(heightIn, weightLb);
    const bfPercent = estimateBodyFat(sex, bmi);

    return {
      bfPercent,
      bmi,
      weightLb,
      provider: "placeholder",
      summary: `Estimated body fat ${bfPercent.toFixed(1)}% with BMI ${bmi.toFixed(1)}`,
    };
  }
}
