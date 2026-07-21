import type { ConsoleMessage, Page } from "@playwright/test";

const benignConsolePatterns: Array<RegExp> = [
  /Extensions are not allowed/, // browser-specific noise
  /Download the React DevTools/, // React devtools suggestion
  /was preloaded using link preload but not used within a few seconds/,
  /chrome-error\:\/\//,
];

function isBenign(message: ConsoleMessage): boolean {
  const text = message.text();
  const sourceUrl = message.location().url;
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

  return benignConsolePatterns.some((pattern) => pattern.test(text));
}

export async function acceptPoliciesIfShown(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Welcome to MyBodyScan" });
  if (await dialog.isVisible().catch(() => false)) {
    await dialog.getByRole("button", { name: "I Accept" }).click();
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
