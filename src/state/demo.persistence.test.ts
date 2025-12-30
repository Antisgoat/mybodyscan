// @vitest-environment jsdom

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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
  return { sessionStorage, localStorage };
}

function teardownWindowStubs() {
  delete (globalThis as Partial<typeof globalThis>).window;
  delete (globalThis as Partial<typeof globalThis>).sessionStorage;
  delete (globalThis as Partial<typeof globalThis>).localStorage;
}

describe("demo state persistence", () => {
  beforeEach(() => {
    installWindowStubs();
  });

  afterEach(() => {
    teardownWindowStubs();
    vi.restoreAllMocks();
  });

  it("loads demo=1 from localStorage after a module reload (simulated refresh)", async () => {
    (window as any).localStorage.setItem("mbs_demo", "1");

    vi.resetModules();
    const demo = await import("./demo");

    expect(demo.isDemoEnabled()).toBe(true);
  });
});

