import * as nativeAuth from "./webAuth.native";
import { isCapacitorNative } from "@/lib/platform/isNative";

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
  if (isCapacitorNative()) {
    return nativeAuth.webRequireAuth();
  }
  const mod = await loadWebAuth();
  return mod.webRequireAuth();
}

export async function ensureWebAuthPersistence() {
  if (isCapacitorNative()) {
    return nativeAuth.ensureWebAuthPersistence();
  }
  const mod = await loadWebAuth();
  return mod.ensureWebAuthPersistence();
}

export async function finalizeRedirectResult() {
  if (isCapacitorNative()) {
    return nativeAuth.finalizeRedirectResult();
  }
  const mod = await loadWebAuth();
  return mod.finalizeRedirectResult();
}

export default {
  webRequireAuth,
  ensureWebAuthPersistence,
  finalizeRedirectResult,
};
