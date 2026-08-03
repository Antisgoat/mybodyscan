import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const scanSource = readFileSync("src/pages/Scan.tsx", "utf8");

describe("scan submission navigation", () => {
  it("opens the live result tracker immediately after an accepted submission", () => {
    const accepted = scanSource.indexOf('stage: "queued"');
    const navigation = scanSource.indexOf('nav(`/scans/${startedScanId}`)', accepted);

    expect(accepted).toBeGreaterThan(-1);
    expect(navigation).toBeGreaterThan(accepted);
    expect(scanSource).not.toContain("}, 45_000)");
  });
});
