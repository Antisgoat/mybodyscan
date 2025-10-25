// App Check removed: provide no-op stubs to keep app stable without reCAPTCHA
export async function ensureAppCheck(): Promise<null> {
  return null;
}

export async function getAppCheckToken(_forceRefresh = false): Promise<null> {
  return null;
}

export function initAppCheck(): Promise<void> {
  return Promise.resolve();
}

export function isAppCheckActive(): boolean {
  return false;
}

export function isAppCheckReady(): boolean {
  return true;
}

export async function waitForAppCheckReady(): Promise<void> {
  return;
}

export function getAppCheckInstance(): null {
  return null;
}

export function getAppCheckError(): null {
  return null;
}
