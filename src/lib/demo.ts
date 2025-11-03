const STORAGE_KEY = 'mbs.demo';

function safeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function broadcastDemoChange(enabled: boolean) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('mbs:demo-change', { detail: { enabled } }),
    );
  } catch {
    // ignore
  }
}

export const DEMO_KEY = 'mbs.demo';

export const isDemo = (): boolean => {
  const storage = safeLocalStorage();
  if (!storage) return false;
  return storage.getItem(STORAGE_KEY) === '1';
};

export const enableDemo = (): void => {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, '1');
    broadcastDemoChange(true);
  } catch {
    // ignore persistence errors
  }
};

export const disableDemo = (): void => {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
    broadcastDemoChange(false);
  } catch {
    // ignore persistence errors
  }
};
