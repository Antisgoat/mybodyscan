import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const APP_CHECK_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "appCheck.web.ts"),
  "utf8"
);

const NATIVE_APP_CHECK_SOURCE = fs.readFileSync(
  path.resolve(__dirname, "appCheck.native.ts"),
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

  it("keeps App Check inert under Vitest even when CI provides a site key", () => {
    expect(APP_CHECK_SOURCE).toContain('env.VITEST === "true"');
    expect(APP_CHECK_SOURCE).toContain('env.MODE === "test"');
    expect(APP_CHECK_SOURCE).toContain(
      'isTestRuntime || siteKeyRaw === "__DISABLE__"'
    );
  });

  it("bridges native attestation into every Firebase JS client without a debug provider", () => {
    expect(NATIVE_APP_CHECK_SOURCE).toContain(
      'registerPlugin<NativeAppCheckPlugin>("FirebaseAppCheck")'
    );
    expect(NATIVE_APP_CHECK_SOURCE).toContain("new CustomProvider");
    expect(NATIVE_APP_CHECK_SOURCE).toContain(
      "provider: new CustomProvider"
    );
    expect(NATIVE_APP_CHECK_SOURCE).toContain("getToken: getNativeToken");
    expect(NATIVE_APP_CHECK_SOURCE).toContain(
      "isTokenAutoRefreshEnabled: true"
    );
    expect(NATIVE_APP_CHECK_SOURCE).not.toContain("debugToken: true");
    expect(NATIVE_APP_CHECK_SOURCE).not.toContain(
      '@capacitor-firebase/app-check'
    );
  });
});
