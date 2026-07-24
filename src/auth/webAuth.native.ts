type NativePersistenceMode = "native";

export async function webRequireAuth(): Promise<null> {
  return null;
}

// mbs-auth.native initializes Firebase JS Auth with IndexedDB persistence. The
// native bridge is reserved for secure Google/Apple provider UI.
export async function ensureWebAuthPersistence(): Promise<NativePersistenceMode> {
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
