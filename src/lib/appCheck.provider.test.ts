import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_CHECK_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "appCheck.ts"),
  "utf8"
);

describe("Firebase App Check provider", () => {
  it("uses reCAPTCHA Enterprise for the production web registration", () => {
    expect(APP_CHECK_SOURCE).toContain("ReCaptchaEnterpriseProvider");
    expect(APP_CHECK_SOURCE).toContain(
      "provider: new ReCaptchaEnterpriseProvider(siteKey)"
    );
    expect(APP_CHECK_SOURCE).not.toContain("ReCaptchaV3Provider");
  });
});
