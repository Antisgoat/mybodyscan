import { isDemo as getDemoState } from "@/state/demo";
import { setDemo } from "@/state/demo";

export const DEMO_KEY = "mbs.demo";

function broadcastDemoChange(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("mbs:demo-change", { detail: { enabled } }));
  } catch {
    // ignore
  }
}

export const isDemo = (): boolean => {
  return getDemoState();
};

export const enableDemo = (): void => {
  setDemo(true);
  broadcastDemoChange(true);
};

export const disableDemo = (): void => {
  setDemo(false);
  broadcastDemoChange(false);
};
