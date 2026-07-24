import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildIdentityToolkitProjectConfigUrl,
  checkIdentityToolkitReachability,
} from "./idtoolkit";

describe("Identity Toolkit reachability", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the documented public project configuration endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ projectId: "mybodyscan-f3daf" }), {
        status: 200,
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      checkIdentityToolkitReachability("public web key")
    ).resolves.toEqual({ reachable: true });
    expect(fetchMock).toHaveBeenCalledWith(
      buildIdentityToolkitProjectConfigUrl("public web key"),
      expect.objectContaining({ method: "GET" })
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://identitytoolkit.googleapis.com/v1/projects?key=public%20web%20key"
    );
  });
});
