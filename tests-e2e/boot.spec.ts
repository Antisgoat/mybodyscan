import { test, expect } from "@playwright/test";

test.describe("Boot diagnostics", () => {
  test("init.json exposes apiKey and ITK responds", async ({
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
      `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(j.apiKey)}`,
      {
        headers: {
          Origin: baseURL ?? "https://mybodyscanapp.com",
          Referer: `${baseURL ?? "https://mybodyscanapp.com"}/`,
        },
      }
    );
    expect(itk.ok()).toBeTruthy();
  });
});
