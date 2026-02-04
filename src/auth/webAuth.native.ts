export async function webRequireAuth(): Promise<null> {
  return null;
}

export async function ensureWebAuthPersistence(): Promise<"native"> {
  return "native";
}

export async function finalizeRedirectResult(): Promise<null> {
  return null;
}

export default {
  webRequireAuth,
  ensureWebAuthPersistence,
  finalizeRedirectResult,
};
