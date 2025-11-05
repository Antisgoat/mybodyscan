import { disableDemo as disableStoreDemo, enableDemo as enableStoreDemo, get } from "@/state/demo";

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
  return get().demo;
};

export const enableDemo = (): void => {
  enableStoreDemo();
  broadcastDemoChange(true);
};

export const disableDemo = (): void => {
  disableStoreDemo();
  broadcastDemoChange(false);
};
