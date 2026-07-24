import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractLocalAssetPaths,
  findMissingLocalAssets,
  resolvePublicAssetPath,
} from "../scripts/lib/static-bundle-integrity.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true }))
  );
});

describe("static bundle integrity", () => {
  it("extracts unique local assets without treating external URLs as files", () => {
    const html = `
      <script src="/assets/app.js?cache=1"></script>
      <script src="./assets/native.js?cache=2"></script>
      <link href="/assets/app.css#theme" rel="stylesheet">
      <link href="./assets/native.css#theme" rel="stylesheet">
      <link href="/assets/app.css" rel="preload">
      <link href="https://mybodyscanapp.com/" rel="canonical">
      <script src="//cdn.example.com/library.js"></script>
    `;

    expect(extractLocalAssetPaths(html)).toEqual([
      "/assets/app.js",
      "/assets/native.js",
      "/assets/app.css",
      "/assets/native.css",
    ]);
  });

  it("reports stale hashed references even when the assets directory is non-empty", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "mybodyscan-bundle-integrity-")
    );
    temporaryDirectories.push(root);
    await fs.mkdir(path.join(root, "assets"));
    await fs.writeFile(path.join(root, "assets", "current.js"), "export {};");

    const result = await findMissingLocalAssets(
      root,
      '<script src="/assets/stale.js"></script>'
    );

    expect(result.missing).toEqual([
      {
        publicPath: "/assets/stale.js",
        filePath: path.join(root, "assets", "stale.js"),
      },
    ]);
  });

  it("rejects paths that escape the bundle root", () => {
    expect(() =>
      resolvePublicAssetPath("/tmp/public", "/../private.txt")
    ).toThrow(/escapes the bundle root/);
  });
});
