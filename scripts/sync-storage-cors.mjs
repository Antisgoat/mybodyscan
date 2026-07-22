#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { Storage } from "@google-cloud/storage";

const PROJECT_ID = "mybodyscan-f3daf";
const BUCKET_NAME = "mybodyscan-f3daf.firebasestorage.app";
const CONFIG_PATH = path.resolve(process.cwd(), "scripts", "cors.json");
const apply = process.argv.includes("--apply");

const normalize = (rules) =>
  (rules ?? [])
    .map((rule) => ({
      origin: [...(rule.origin ?? [])].sort(),
      method: [...(rule.method ?? [])].sort(),
      responseHeader: [...(rule.responseHeader ?? [])].sort(),
      maxAgeSeconds: Number(rule.maxAgeSeconds ?? 0),
    }))
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right))
    );

const desired = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
const storage = new Storage({ projectId: PROJECT_ID });
const bucket = storage.bucket(BUCKET_NAME);

let [metadata] = await bucket.getMetadata();
let matches =
  JSON.stringify(normalize(metadata.cors)) ===
  JSON.stringify(normalize(desired));

if (!matches && apply) {
  await bucket.setCorsConfiguration(desired);
  [metadata] = await bucket.getMetadata();
  matches =
    JSON.stringify(normalize(metadata.cors)) ===
    JSON.stringify(normalize(desired));
}

if (!matches) {
  console.error(
    "Production Storage CORS does not match scripts/cors.json. Run npm run storage:cors:apply with the MyBodyScan deployment identity."
  );
  process.exit(1);
}

console.log(
  `Production Storage CORS verified (${metadata.cors?.length ?? 0} rule, ${metadata.cors?.[0]?.origin?.length ?? 0} origins).`
);
