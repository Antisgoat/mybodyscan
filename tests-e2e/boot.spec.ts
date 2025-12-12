import { test, expect } from "@playwright/test";

test.describe("Boot diagnostics", () => {
  test.skip(
    true,
    "Enable after hosting cache is purged and init.json matches rotated key"
  );

  test("init.json exposes apiKey and ITK responds", async ({
    page,
    request,
    baseURL,
  }) => {
    const initRes = await request.get(
      `${baseURL}/__/firebase/init.json?ts=${Date.now()}`
    );
    expect(initRes.ok()).toBeTruthy();
    const j = await initRes.json();
    expect(typeof j.apiKey).toBe("string");
    expect(j.apiKey.length).toBeGreaterThan(10);

    const itk = await request.get(
      `https://identitytoolkit.googleapis.com/v2/projects/mybodyscan-f3daf/config?key=${encodeURIComponent(j.apiKey)}`
    );
    expect(itk.ok()).toBeTruthy();
  });
});
