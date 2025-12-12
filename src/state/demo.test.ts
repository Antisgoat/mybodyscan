import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import {
  disableDemo,
  enableDemo,
  isDemo,
  setDemo,
  subscribeDemo,
} from "./demo";

type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
};

function createStorage(): StorageLike {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

function installWindowStubs() {
  const sessionStorage = createStorage();
  const localStorage = createStorage();
  const mockWindow = {
    sessionStorage,
    localStorage,
    location: {
      search: "",
      pathname: "/",
      href: "https://example.test/",
      hash: "",
    },
    history: { replaceState: vi.fn() },
  } as any;
  Object.assign(globalThis, {
    window: mockWindow,
    sessionStorage,
    localStorage,
  });
}

function teardownWindowStubs() {
  delete (globalThis as Partial<typeof globalThis>).window;
  delete (globalThis as Partial<typeof globalThis>).sessionStorage;
  delete (globalThis as Partial<typeof globalThis>).localStorage;
}

describe("demo state store", () => {
  beforeEach(() => {
    installWindowStubs();
    disableDemo();
  });

  afterEach(() => {
    disableDemo();
    teardownWindowStubs();
  });

  it("does not fire subscribers synchronously upon subscribe", () => {
    const events: boolean[] = [];
    const unsubscribe = subscribeDemo(() => events.push(isDemo()));

    expect(events).toEqual([]);

    setDemo(true);
    expect(events).toEqual([true]);

    // setting to the same value should not emit another notification
    setDemo(true);
    expect(events).toEqual([true]);

    setDemo(false);
    expect(events).toEqual([true, false]);

    unsubscribe();
  });

  it("stops notifying listeners after unsubscribe", () => {
    const events: boolean[] = [];
    const unsubscribe = subscribeDemo(() => events.push(isDemo()));

    setDemo(true);
    expect(events).toEqual([true]);

    unsubscribe();
    setDemo(false);

    expect(events).toEqual([true]);
  });

  it("coalesces nested updates triggered inside listeners", () => {
    const events: boolean[] = [];
    const unsubscribe = subscribeDemo(() => {
      const value = isDemo();
      events.push(value);
      if (value) {
        setDemo(false);
      }
    });

    setDemo(true);

    expect(events).toEqual([true, false]);

    unsubscribe();
  });

  it("persists the session flag when toggling demo mode", () => {
    expect(window.sessionStorage.getItem("mbs_demo")).toBeNull();
    enableDemo();
    expect(window.sessionStorage.getItem("mbs_demo")).toBe("1");
    disableDemo();
    expect(window.sessionStorage.getItem("mbs_demo")).toBeNull();
  });
});
