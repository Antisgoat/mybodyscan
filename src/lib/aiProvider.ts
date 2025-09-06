import { runBodyScan } from "./scan";

export async function callBodyScan(file: string) {
  if (import.meta.env.MODE === "test") {
    return {
      scanId: "mock-scan",
      result: { bodyFatPct: 18.7, weightKg: 78.1, bmi: 24.6, mock: true },
    };
  }
  return runBodyScan(file);
}
