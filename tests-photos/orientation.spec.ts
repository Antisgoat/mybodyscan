import { expect, test } from "@playwright/test";

for (const path of ["worker", "bitmap-fallback", "image-fallback"]) {
  test(`${path} preserves pixels for all eight EXIF orientations`, async ({
    page,
  }) => {
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.protocol === "blob:" || url.protocol === "data:")
        return route.continue();
      if (url.hostname !== "127.0.0.1") return route.abort();
      if (url.pathname === "/photo-test") {
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>Local photo test</title>",
        });
      }
      return route.continue();
    });
    await page.goto("/photo-test");
    const results = await page.evaluate(async (decodePath) => {
      if (decodePath !== "worker")
        Object.defineProperty(window, "Worker", { value: undefined });
      if (decodePath === "image-fallback")
        Object.defineProperty(window, "createImageBitmap", {
          value: undefined,
        });
      const modulePath = "/src/features/scan/resizeImage.ts";
      const { prepareScanPhoto } = await import(modulePath);
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const ctx = canvas.getContext("2d")!;
      for (const [color, x, y] of [
        ["#e02020", 0, 0],
        ["#20e020", 600, 0],
        ["#2020e0", 0, 450],
        ["#e0e020", 600, 450],
      ] as const) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 600, 450);
      }
      const jpeg = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.95)
      );
      const encoded = new Uint8Array(await jpeg.arrayBuffer());
      // Safari may emit its own EXIF block. Replace it, rather than creating
      // conflicting metadata blocks in the synthetic fixture.
      const parts: Uint8Array[] = [encoded.slice(0, 2)];
      let offset = 2;
      while (
        offset + 4 <= encoded.length &&
        encoded[offset] === 255 &&
        encoded[offset + 1] !== 218
      ) {
        const length = (encoded[offset + 2] << 8) | encoded[offset + 3];
        if (encoded[offset + 1] !== 225)
          parts.push(encoded.slice(offset, offset + 2 + length));
        offset += 2 + length;
      }
      parts.push(encoded.slice(offset));
      const raw = new Uint8Array(await new Blob(parts).arrayBuffer());
      async function sample(blob: Blob) {
        const image = new Image();
        const url = URL.createObjectURL(blob);
        try {
          image.src = url;
          await image.decode();
          const c = document.createElement("canvas");
          c.width = image.naturalWidth;
          c.height = image.naturalHeight;
          const context = c.getContext("2d")!;
          context.drawImage(image, 0, 0);
          const pixels = [
            [0.25, 0.25],
            [0.75, 0.25],
            [0.25, 0.75],
            [0.75, 0.75],
          ].flatMap(([x, y]) =>
            Array.from(
              context.getImageData(
                Math.floor(x * c.width),
                Math.floor(y * c.height),
                1,
                1
              ).data
            ).slice(0, 3)
          );
          return { width: c.width, height: c.height, pixels };
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      const results = [];
      for (let orientation = 1; orientation <= 8; orientation++) {
        // Minimal little-endian EXIF APP1 with a single Orientation entry.
        const exif = new Uint8Array([
          255,
          225,
          0,
          34,
          69,
          120,
          105,
          102,
          0,
          0,
          73,
          73,
          42,
          0,
          8,
          0,
          0,
          0,
          1,
          0,
          18,
          1,
          3,
          0,
          1,
          0,
          0,
          0,
          orientation,
          0,
          0,
          0,
          0,
          0,
          0,
          0,
        ]);
        const file = new File(
          [raw.slice(0, 2), exif, raw.slice(2)],
          "orientation.jpg",
          { type: "image/jpeg" }
        );
        const before = await sample(file).catch((error) => {
          throw new Error(`source orientation ${orientation}: ${error}`);
        });
        const prepared = await prepareScanPhoto(file, "front");
        const after = await sample(prepared.preparedFile).catch((error) => {
          throw new Error(`output orientation ${orientation}: ${error}`);
        });
        results.push({
          orientation,
          before,
          after,
          meta: prepared.meta.prepared,
        });
      }
      return results;
    }, path);
    for (const { orientation, before, after, meta } of results) {
      expect(
        after.width / after.height,
        `orientation ${orientation} aspect ratio`
      ).toBeCloseTo(before.width / before.height, 2);
      expect({ width: meta.width, height: meta.height }).toEqual({
        width: after.width,
        height: after.height,
      });
      after.pixels.forEach((value: number, index: number) =>
        expect(
          Math.abs(value - before.pixels[index]),
          `orientation ${orientation}, channel ${index}`
        ).toBeLessThan(15)
      );
    }
  });
}
