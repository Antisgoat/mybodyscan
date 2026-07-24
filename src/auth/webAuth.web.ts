let webAuthPromise:
  | Promise<typeof import("./mbs-auth.web")>
  | null = null;

function loadWebAuth() {
  if (!webAuthPromise) {
    webAuthPromise = import("./mbs-auth.web");
  }
  return webAuthPromise;
}

export async function webRequireAuth() {
  const mod = await loadWebAuth();
  return mod.webRequireAuth();
}

export async function ensureWebAuthPersistence() {
  const mod = await loadWebAuth();
  return mod.ensureWebAuthPersistence();
}

export async function finalizeRedirectResult() {
  const mod = await loadWebAuth();
  return mod.finalizeRedirectResult();
}

export default {
  webRequireAuth,
  ensureWebAuthPersistence,
  finalizeRedirectResult,
};
