// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitScanClient } from "@/lib/api/scan";
import { weightLbToKg } from "@/lib/units";

const fetchMock = vi.fn();

vi.mock("@/features/scan/resizeImage", () => ({
  prepareScanPhoto: vi.fn(async (file: File) => ({
    preparedFile: file,
    meta: {
      original: { size: file.size, name: file.name, type: file.type },
      prepared: { size: file.size, name: file.name, type: file.type },
      debug: {},
    },
  })),
}));

vi.mock("@/lib/firebase", () => {
  return {
    auth: {
      currentUser: {
        uid: "user-123",
        getIdToken: vi.fn().mockResolvedValue("token"),
        getIdTokenResult: vi.fn().mockResolvedValue(null),
      },
    },
    db: {} as any,
    storage: {} as any,
  };
});

describe("submitScanClient weight/unit consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).fetch = fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ scanId: "scan-1", status: "queued" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    ) as any;
  });

  it("does not send kg values labeled as lb (188 lb -> ~85.275 kg)", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "p.jpg", { type: "image/jpeg" });
    const currentKg = weightLbToKg(188);
    const goalKg = weightLbToKg(170);

    const result = await submitScanClient({
      scanId: "scan-1",
      photos: { front: file, back: file, left: file, right: file },
      currentWeightKg: currentKg,
      goalWeightKg: goalKg,
      unit: "lb",
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = init?.body as FormData;
    expect(body).toBeTruthy();
    expect(body.get("unit")).toBe("lb");

    const currentRaw = Number(body.get("currentWeight"));
    const goalRaw = Number(body.get("goalWeight"));
    expect(currentRaw).toBeCloseTo(188, 1);
    expect(goalRaw).toBeCloseTo(170, 1);

    expect(Number(body.get("currentWeightKg"))).toBeCloseTo(currentKg, 6);
    expect(Number(body.get("goalWeightKg"))).toBeCloseTo(goalKg, 6);
  });
});

