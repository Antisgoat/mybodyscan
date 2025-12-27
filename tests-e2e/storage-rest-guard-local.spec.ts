import { test, expect } from "@playwright/test";

// Keep forbidden patterns encoded so repo-wide greps stay clean.
const ENCODED = {
  host: "ZmlyZWJhc2VzdG9yYWdlLmdvb2dsZWFwaXMuY29t",
  v0b: "L3YwL2Iv",
  oname: "bz9uYW1lPQ==",
} as const;

function decode(input: string): string {
  return Buffer.from(input, "base64").toString("utf8");
}

test("never requests forbidden Storage REST URLs (smoke)", async ({ page }) => {
  const patterns = [decode(ENCODED.host), decode(ENCODED.v0b), decode(ENCODED.oname)];
  const offenders: string[] = [];

  const check = (url: string) => {
    if (!/^https?:/i.test(url)) return;
    if (patterns.some((p) => url.toLowerCase().includes(p.toLowerCase()))) {
      offenders.push(url);
    }
  };

  page.on("request", (req) => check(req.url()));

  // Boot.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  // Navigate to scan page (may redirect to /auth if signed out).
  await page.goto("/scan", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);

  // Also guard against DOM-constructed URLs (img/src, link/href, etc).
  const domUrls = await page.evaluate((pats) => {
    const urls: string[] = [];
    const add = (value: string | null) => {
      if (!value) return;
      urls.push(value);
    };
    document.querySelectorAll("img").forEach((el) => add((el as HTMLImageElement).src));
    document.querySelectorAll("a").forEach((el) => add((el as HTMLAnchorElement).href));
    document.querySelectorAll("source").forEach((el) => add((el as HTMLSourceElement).src));
    document
      .querySelectorAll("video")
      .forEach((el) => add((el as HTMLVideoElement).currentSrc || (el as HTMLVideoElement).src));
    return urls.filter((u) =>
      pats.some((p) => u.toLowerCase().includes(String(p).toLowerCase()))
    );
  }, patterns);

  offenders.push(...domUrls);

  // Fail with a short list (don’t spam).
  expect(offenders.slice(0, 5)).toEqual([]);
});

