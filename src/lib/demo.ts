export const DEMO_KEY = "mbs.demo";

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function broadcastDemoChange(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("mbs:demo-change", { detail: { enabled } }));
  } catch {
    /* noop */
  }
}

export const isDemo = (): boolean => {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(DEMO_KEY) === "1";
  } catch {
    return false;
  }
};

export const enableDemo = (): void => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(DEMO_KEY, "1");
    broadcastDemoChange(true);
  } catch {
    /* ignore */
  }
};

export const disableDemo = (): void => {
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.removeItem(DEMO_KEY);
    broadcastDemoChange(false);
  } catch {
    /* ignore */
  }
};
