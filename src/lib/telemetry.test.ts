import { describe, expect, it } from "vitest";

import { sanitizeTelemetryBody } from "@/lib/telemetry";

describe("telemetry payload sanitizer", () => {
  it("removes undefined values (including nested)", () => {
    const body = sanitizeTelemetryBody({
      kind: "window_error",
      message: "boom",
      code: undefined,
      stack: undefined,
      url: undefined,
      component: undefined,
      extra: {
        a: 1,
        b: undefined,
        nested: { c: undefined, d: "ok" },
      },
    });

    expect(JSON.stringify(body)).not.toContain("undefined");
    expect(body).toMatchObject({
      kind: "window_error",
      message: "boom",
      extra: {
        a: 1,
        nested: { d: "ok" },
      },
    });
  });
});
