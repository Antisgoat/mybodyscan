const TODO_LINK = "https://linear.app/mybodyscan/issue/HEALTH-SHIM";

const NOT_AVAILABLE_ERROR =
  "Health integrations are not live yet. This screen is gated until Apple Health/Google Fit connectors ship.";

function logShim(method: string) {
  console.info(`[shim-disabled] ${method}() – real connector pending. TODO: ${TODO_LINK}`);
}

export type HealthProvider = "apple-health" | "google-health-connect" | "manual";

/**
 * Placeholder helpers that make it explicit we do NOT connect to any health provider yet.
 * All callers must surface the "coming soon" state instead of pretending a connection succeeded.
 */
export async function connectMock(_provider: HealthProvider): Promise<never> {
  logShim("connectMock");
  throw new Error(NOT_AVAILABLE_ERROR);
}

export async function syncDayMock(_day: "today" | "yesterday"): Promise<never> {
  logShim("syncDayMock");
  throw new Error(NOT_AVAILABLE_ERROR);
}
