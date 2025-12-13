import { describe, expect, it } from "vitest";
import { buildTelemetryBody } from "@/lib/telemetry";

describe("telemetry payload sanitizer", () => {
  it("drops undefined fields (including nested) so JSON is stable", () => {
    const body = buildTelemetryBody({
      kind: "window_error",
      message: "boom",
      code: undefined,
      stack: undefined,
      extra: {
        a: 1,
        b: undefined,
        nested: { c: undefined, d: "ok" },
        arr: [1, undefined, 2],
      },
    });

    expect(body).toMatchObject({
      kind: "window_error",
      message: "boom",
      extra: { a: 1, nested: { d: "ok" }, arr: [1, 2] },
    });
    expect("code" in body).toBe(false);
    expect("stack" in body).toBe(false);
  });
});

