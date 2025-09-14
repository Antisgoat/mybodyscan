import type { ScanInput, ScanOutput, ScanProvider } from "./scanProvider.js";

function computeBmi(heightIn: number, weightLb: number): number {
  return (weightLb / (heightIn * heightIn)) * 703;
}

function estimateBodyFatNavy(params: {
  sex: "male" | "female";
  heightIn: number;
  weightLb: number;
  waistIn?: number;
  neckIn?: number;
  hipIn?: number;
}): number {
  const { sex, heightIn, weightLb, waistIn, neckIn, hipIn } = params;
  if (sex === "male" && waistIn && neckIn) {
    return (
      495 /
        (1.0324 - 0.19077 * Math.log10(waistIn - neckIn) +
          0.15456 * Math.log10(heightIn)) -
      450
    );
  }
  if (sex === "female" && waistIn && neckIn && hipIn) {
    return (
      495 /
        (1.29579 -
          0.35004 * Math.log10(waistIn + hipIn - neckIn) +
          0.221 * Math.log10(heightIn)) -
      450
    );
  }
  // Fallback to Deurenberg formula when measurements are missing
  const bmi = computeBmi(heightIn, weightLb);
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
    const bfPercent = estimateBodyFatNavy({
      sex,
      heightIn,
      weightLb,
      waistIn: input.waistIn,
      neckIn: input.neckIn,
      hipIn: input.hipIn,
    });

    return {
      bfPercent,
      bmi,
      weightLb,
      provider: "placeholder",
      summary: `Estimated body fat ${bfPercent.toFixed(1)}% with BMI ${bmi.toFixed(1)}`,
    };
  }
}
