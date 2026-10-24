import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/auth/mbs-auth", () => ({
  getIdToken: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/appCheck", () => ({
  getAppCheckTokenHeader: vi.fn().mockResolvedValue({}),
}));
import { apiFetchJson } from "./apiFetch";
afterEach(() => vi.restoreAllMocks());
it("rejects successful HTML instead of reporting it as a successful app action", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("<html>login page</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    })
  );
  await expect(apiFetchJson("/api/system/health")).rejects.toMatchObject({
    code: "non_json_response",
  });
});
it("rejects malformed JSON rather than returning an empty successful result", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("not JSON", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  await expect(apiFetchJson("/api/system/health")).rejects.toMatchObject({
    code: "invalid_json_response",
  });
});
it("preserves valid JSON results", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response('{"ok":true}', {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  );
  await expect(apiFetchJson("/api/system/health")).resolves.toEqual({
    ok: true,
  });
});
