export type ScanInput = {
  frontUrl?: string;
  leftUrl?: string;
  rightUrl?: string;
  backUrl?: string;
  sex?: "male" | "female";
  heightIn?: number;
  weightLb?: number;
  waistIn?: number;
  neckIn?: number;
  hipIn?: number;
};

export type ScanOutput = {
  bfPercent: number;
  bmi?: number;
  weightLb?: number;
  provider: "placeholder" | "openai" | "replicate";
  confidence?: number;
  summary?: string;
};

export interface ScanProvider {
  analyze(input: ScanInput): Promise<ScanOutput>;
}
