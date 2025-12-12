import type { ConsoleMessage, Page } from "@playwright/test";

const benignConsolePatterns: Array<RegExp> = [
  /Extensions are not allowed/, // browser-specific noise
  /Download the React DevTools/, // React devtools suggestion
  /was preloaded using link preload but not used within a few seconds/,
  /chrome-error\:\/\//,
];

function isBenign(message: ConsoleMessage): boolean {
  const text = message.text();
  return benignConsolePatterns.some((pattern) => pattern.test(text));
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
