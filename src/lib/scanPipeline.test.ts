import { beforeEach, describe, expect, it } from "vitest";
import {
  readActiveScanId,
  readScanPipelineState,
  updateScanPipelineState,
} from "@/lib/scanPipeline";

function ensureLocalStorage() {
  if (typeof globalThis.localStorage !== "undefined") return;
  const store = new Map<string, string>();
  globalThis.localStorage = {
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
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

describe("scanPipeline", () => {
  beforeEach(() => {
    ensureLocalStorage();
    globalThis.localStorage.clear();
  });

  it("persists stage progression and clears active on completion", () => {
    updateScanPipelineState("scan-123", { stage: "init" });
    expect(readActiveScanId()).toBe("scan-123");

    updateScanPipelineState("scan-123", { stage: "upload_front" });
    const mid = readScanPipelineState("scan-123");
    expect(mid?.stage).toBe("upload_front");

    updateScanPipelineState("scan-123", { stage: "result_ready" });
    expect(readActiveScanId()).toBeNull();
  });
});
