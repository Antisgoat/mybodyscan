import { describe, expect, it } from "vitest";
import { derivePlateauAlert, normalizePlateauGoal } from "@/lib/plateauAlert";

const scan = (id: string, day: number, weightKg: number, bodyFatPercent?: number) => ({
  id,
  date: new Date(Date.UTC(2026, 0, 1 + day)),
  showMetrics: true,
  raw: { status: "complete", weightKg, bodyFatPercentage: bodyFatPercent },
});

describe("derivePlateauAlert", () => {
  it("recognizes stored goal variants", () => {
    expect(normalizePlateauGoal("lose-fat")).toBe("lose_fat");
    expect(normalizePlateauGoal("hypertrophy")).toBe("gain_muscle");
    expect(normalizePlateauGoal("maintenance")).toBe("maintain");
  });

  it("detects a sustained fat-loss plateau using body fat", () => {
    const result = derivePlateauAlert(
      [scan("a", 0, 80, 25), scan("b", 14, 79.8, 24.7), scan("c", 28, 80.1, 24.8)],
      "lose-fat"
    );
    expect(result?.metric).toBe("body_fat");
    expect(result?.spanDays).toBe(28);
  });

  it("does not alert with too few scans or too little elapsed time", () => {
    expect(derivePlateauAlert([scan("a", 0, 80), scan("b", 28, 80)], "gain-muscle")).toBeNull();
    expect(
      derivePlateauAlert(
        [scan("a", 0, 80), scan("b", 7, 80), scan("c", 14, 80)],
        "gain-muscle"
      )
    ).toBeNull();
  });

  it("does not call maintenance or meaningful movement a plateau", () => {
    const stable = [scan("a", 0, 80, 25), scan("b", 14, 80, 25), scan("c", 28, 80, 25)];
    expect(derivePlateauAlert(stable, "maintain")).toBeNull();
    expect(
      derivePlateauAlert(
        [scan("a", 0, 80, 25), scan("b", 14, 78, 23.8), scan("c", 28, 76, 22.5)],
        "lose_fat"
      )
    ).toBeNull();
  });

  it("requires body-fat history to assess recomposition", () => {
    expect(
      derivePlateauAlert(
        [scan("a", 0, 80), scan("b", 14, 80), scan("c", 28, 80)],
        "recomp"
      )
    ).toBeNull();
  });

  it("ignores scans whose metrics should not be shown", () => {
    const hidden = { ...scan("b", 14, 80, 25), showMetrics: false };
    expect(
      derivePlateauAlert([scan("a", 0, 80, 25), hidden, scan("c", 28, 80, 25)], "lose-fat")
    ).toBeNull();
  });
});
