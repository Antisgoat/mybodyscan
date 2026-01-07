// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

const call = vi.fn().mockResolvedValue({ data: { ok: true } });
vi.mock("@/lib/callable", () => ({ call: (...a: any[]) => call(...a) }));

import { requestAccountDeletion } from "@/lib/account";

describe("requestAccountDeletion", () => {
  it("calls deleteMyAccount and resolves on ok", async () => {
    await expect(requestAccountDeletion()).resolves.toBeUndefined();
    expect(call).toHaveBeenCalledWith("deleteMyAccount", {});
  });

  it("throws when backend does not return ok", async () => {
    call.mockResolvedValueOnce({ data: { ok: false } });
    await expect(requestAccountDeletion()).rejects.toThrow("delete_failed");
  });
});

