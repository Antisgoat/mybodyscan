import { describe, expect, it } from "vitest";
import { isBenignConsoleError } from "../e2e/utils/consoleGuard";

describe("live E2E console guard", () => {
  it("allows the headless reCAPTCHA Enterprise storage warning", () => {
    expect(
      isBenignConsoleError(
        "requestStorageAccess: Permission denied.",
        "https://www.google.com/recaptcha/enterprise/anchor?ar=1"
      )
    ).toBe(true);
  });

  it("does not hide the same storage error from application code", () => {
    expect(
      isBenignConsoleError(
        "requestStorageAccess: Permission denied.",
        "https://mybodyscanapp.com/assets/app.js"
      )
    ).toBe(false);
  });

  it("allows only this project's headless App Check exchange 403", () => {
    expect(
      isBenignConsoleError(
        "Failed to load resource: the server responded with a status of 403 ()",
        "https://content-firebaseappcheck.googleapis.com/v1/projects/mybodyscan-f3daf/apps/1:157018993008:web:test:exchangeRecaptchaEnterpriseToken?key=redacted"
      )
    ).toBe(true);
  });

  it("does not hide unrelated 403 responses", () => {
    expect(
      isBenignConsoleError(
        "Failed to load resource: the server responded with a status of 403 ()",
        "https://mybodyscanapp.com/api/coach"
      )
    ).toBe(false);
  });

  it("does not hide another project's App Check exchange", () => {
    expect(
      isBenignConsoleError(
        "Failed to load resource: the server responded with a status of 403 ()",
        "https://content-firebaseappcheck.googleapis.com/v1/projects/other-project/apps/1:2:web:test:exchangeRecaptchaEnterpriseToken"
      )
    ).toBe(false);
  });
});
