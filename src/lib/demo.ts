import { auth } from "@/lib/firebase";
import { disableDemoEverywhere, enableDemoLocal, isDemoEffective } from "@/lib/demoState";

export const DEMO_KEY = "mbs.demo";

function broadcastDemoChange(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("mbs:demo-change", { detail: { enabled } }));
  } catch {
    /* noop */
  }
}

export const isDemo = (): boolean => {
  const authed = Boolean(auth.currentUser);
  return isDemoEffective(authed);
};

export const enableDemo = (): void => {
  enableDemoLocal();
  broadcastDemoChange(true);
};

export const disableDemo = (): void => {
  disableDemoEverywhere();
  broadcastDemoChange(false);
};
