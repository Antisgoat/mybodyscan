import type { ConsoleMessage, Page } from "@playwright/test";
import { acceptPolicyGate } from "../../tests-e2e/helpers/policy";

const benignConsolePatterns: Array<RegExp> = [
  /Extensions are not allowed/, // browser-specific noise
  /Download the React DevTools/, // React devtools suggestion
  /was preloaded using link preload but not used within a few seconds/,
  /chrome-error\:\/\//,
];

export function isBenignConsoleError(
  text: string,
  sourceUrl: string
): boolean {
  const isLocalPreview = /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?\//.test(
    sourceUrl
  );

  // A Vite production preview has no Functions proxy. Telemetry is best-effort,
  // and the same URL is handled by Firebase Hosting in a deployed environment.
  if (
    isLocalPreview &&
    /Failed to load resource.*404/.test(text) &&
    /\/(?:telemetry\/log|health)(?:\?|$)/.test(sourceUrl)
  ) {
    return true;
  }

  // Local browser checks can run without outbound network access. Firestore's
  // SDK reports that environment-level outage as a console error while safely
  // switching to its offline cache. Keep the exception local-only so the same
  // message still fails a production smoke test.
  if (
    isLocalPreview &&
    /@firebase\/firestore: Firestore .*Could not reach Cloud Firestore backend/.test(
      text
    )
  ) {
    return true;
  }

  let source: URL | undefined;
  try {
    source = new URL(sourceUrl);
  } catch {
    source = undefined;
  }

  // Invisible reCAPTCHA Enterprise frames request unpartitioned storage, which
  // Chromium denies in headless mode. This message comes from Google's frame,
  // not from application code.
  if (
    text === "requestStorageAccess: Permission denied." &&
    source?.hostname === "www.google.com" &&
    source.pathname === "/recaptcha/enterprise/anchor"
  ) {
    return true;
  }

  // reCAPTCHA Enterprise intentionally refuses headless automation, so the
  // App Check exchange returns 403 in live E2E. Production App Check remains in
  // soft mode until real-browser attestation metrics are proven safe. Restrict
  // this exception to this project's token-exchange endpoint so other 403s fail.
  if (
    /Failed to load resource.*403/.test(text) &&
    source?.hostname === "content-firebaseappcheck.googleapis.com" &&
    source.pathname.startsWith(
      "/v1/projects/mybodyscan-f3daf/apps/"
    ) &&
    source.pathname.endsWith(":exchangeRecaptchaEnterpriseToken")
  ) {
    return true;
  }

  return benignConsolePatterns.some((pattern) => pattern.test(text));
}

function isBenign(message: ConsoleMessage): boolean {
  return isBenignConsoleError(message.text(), message.location().url);
}

export async function acceptPoliciesIfShown(page: Page): Promise<void> {
  if (await acceptPolicyGate(page)) {
    await page.waitForLoadState("domcontentloaded");
  }
}

export function wasRedirectedToAuth(page: Page): boolean {
  return new URL(page.url()).pathname === "/auth";
}

export function attachConsoleGuard(page: Page): void {
  page.on("console", (message) => {
    if (message.type() !== "error") {
      return;
    }

    if (isBenign(message)) {
      return;
    }

    throw new Error(`Console error detected: ${message.text()}`);
  });
}
