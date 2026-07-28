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

  it("allows Google's report-only iframe warning from headless App Check", () => {
    expect(
      isBenignConsoleError(
        `[Report Only] Refused to frame 'https://www.google.com/' because an ancestor violates the following Content Security Policy directive: "frame-ancestors 'self'".`,
        ""
      )
    ).toBe(true);
  });

  it("does not hide enforced or unrelated CSP failures", () => {
    expect(
      isBenignConsoleError(
        `Refused to frame 'https://example.com/' because an ancestor violates the following Content Security Policy directive: "frame-ancestors 'self'".`,
        ""
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

  it("allows Firestore offline fallback only in local preview", () => {
    const message =
      "@firebase/firestore: Firestore (11.10.0): Could not reach Cloud Firestore backend.";
    expect(
      isBenignConsoleError(message, "http://127.0.0.1:4173/assets/firebase.js")
    ).toBe(true);
    expect(
      isBenignConsoleError(
        message,
        "https://mybodyscanapp.com/assets/firebase.js"
      )
    ).toBe(false);
  });
});
