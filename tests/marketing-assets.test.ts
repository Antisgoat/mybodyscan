import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(__dirname, "..");
const file = (relativePath: string) => path.join(root, relativePath);
const read = (relativePath: string) =>
  fs.readFileSync(file(relativePath), "utf8");

const pngMetadata = (relativePath: string) => {
  const data = fs.readFileSync(file(relativePath));

  expect(data.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  );

  let chunkOffset = 8;
  let hasTransparencyChunk = false;
  while (chunkOffset + 12 <= data.length) {
    const chunkLength = data.readUInt32BE(chunkOffset);
    const chunkType = data.toString("ascii", chunkOffset + 4, chunkOffset + 8);
    hasTransparencyChunk ||= chunkType === "tRNS";
    chunkOffset += chunkLength + 12;
    if (chunkType === "IEND") break;
  }

  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    colorType: data[25],
    hasTransparencyChunk,
  };
};

describe("marketing assets", () => {
  it("ships correctly sized opaque store and social artwork", () => {
    const assets = [
      ["resources/icon.png", 1024, 1024],
      ["resources/marketing/google-play-icon-512.png", 512, 512],
      ["resources/marketing/google-play-feature.png", 1024, 500],
      ["public/marketing/mybodyscan-share.png", 1200, 630],
    ] as const;

    for (const [relativePath, width, height] of assets) {
      const metadata = pngMetadata(relativePath);
      expect(metadata.width, relativePath).toBe(width);
      expect(metadata.height, relativePath).toBe(height);
      expect([4, 6], relativePath).not.toContain(metadata.colorType);
      expect(metadata.hasTransparencyChunk, relativePath).toBe(false);
    }
  });

  it("keeps the native iOS store icon and web icons in sync", () => {
    const assets = [
      [
        "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
        1024,
      ],
      ["public/icons/icon-180.png", 180],
      ["public/icons/icon-192.png", 192],
      ["public/icons/icon-512.png", 512],
    ] as const;

    for (const [relativePath, size] of assets) {
      const metadata = pngMetadata(relativePath);
      expect(metadata.width, relativePath).toBe(size);
      expect(metadata.height, relativePath).toBe(size);
      expect([4, 6], relativePath).not.toContain(metadata.colorType);
      expect(metadata.hasTransparencyChunk, relativePath).toBe(false);
    }
  });

  it("publishes install and social metadata with production URLs", () => {
    const document = read("index.html");
    const manifest = JSON.parse(read("public/manifest.webmanifest")) as {
      icons: Array<{ src: string; sizes: string }>;
    };

    expect(document).toContain(
      '<link rel="manifest" href="/manifest.webmanifest" />'
    );
    expect(document).toContain(
      "https://mybodyscanapp.com/marketing/mybodyscan-share.png"
    );
    expect(document).not.toContain("weight from photos or video");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icons/icon-192.png",
          sizes: "192x192",
        }),
        expect.objectContaining({
          src: "/icons/icon-512.png",
          sizes: "512x512",
        }),
      ])
    );
  });

  it("keeps store metadata inside platform limits and free of competitor names", () => {
    const metadata = read("docs/STORE_METADATA_EN_US.md");
    const subtitle = "Training, nutrition & progress";
    const promotionalText =
      "Turn four guided photos into a clearly labeled wellness estimate, then follow personalized training, meal planning, nutrition tracking, and adaptive coaching.";
    const keywords =
      "fitness,progress,workout,nutrition,meal plan,body composition,coach,food tracker,barcode";

    expect(subtitle.length).toBeLessThanOrEqual(30);
    expect(promotionalText.length).toBeLessThanOrEqual(170);
    expect(Buffer.byteLength(keywords, "utf8")).toBeLessThanOrEqual(100);
    expect(metadata).toContain(subtitle);
    expect(metadata).toContain(promotionalText);
    expect(metadata).toContain(keywords);
    expect(metadata).not.toMatch(/\b(Yuka|MyFitnessPal)\b/i);
  });

  it("captures store screenshots with the current policy gate dismissed", () => {
    const captureScript = read("scripts/capture-app-store-screenshots.mjs");

    expect(captureScript).toContain('localStorage.setItem("mbs_policy_ok_v2", "1")');
    expect(captureScript).not.toContain("mbs_policy_ok_v1");
    expect(captureScript).toContain("06-personal-coach.png");
    expect(captureScript).not.toContain("06-ai-coach.png");
  });
});
