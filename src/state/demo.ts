let current = false;
const listeners = new Set<(value: boolean) => void>();

export const isDemo = () => current;

export const setDemo = (value: boolean) => {
  const next = Boolean(value);
  if (next === current) return;
  current = next;
  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch (error) {
      console.error("demo_state_listener_error", error);
    }
  });
};

export const subscribeDemo = (listener: (value: boolean) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
