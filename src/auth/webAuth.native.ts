const DISABLED_MESSAGE =
  "Firebase web auth is disabled in native builds. Use the native auth facade.";

type DisabledError = Error & { code?: string };

function disabledError(): DisabledError {
  const err: DisabledError = new Error(DISABLED_MESSAGE);
  err.code = "auth/web-disabled";
  return err;
}

function rejectDisabled<T = never>(): Promise<T> {
  return Promise.reject(disabledError());
}

export async function webRequireAuth(): Promise<never> {
  return rejectDisabled();
}

export async function ensureWebAuthPersistence(): Promise<never> {
  return rejectDisabled();
}

export async function finalizeRedirectResult(): Promise<never> {
  return rejectDisabled();
}

export default {
  webRequireAuth,
  ensureWebAuthPersistence,
  finalizeRedirectResult,
};
