import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

process.env.GCLOUD_PROJECT ||= "demo-test";

const { buildTransformationPrompt } = await import(
  "../lib/transformationPreview.js"
);
const { buildPlateauMulticastMessage, deriveServerPlateauSignature } = await import(
  "../lib/pushNotifications.js"
);

test("transformation prompt is restrained and prohibits predictive or revealing output", () => {
  const prompt = buildTransformationPrompt({
    goal: "recomp",
    timelineWeeks: 12,
  });
  assert.match(prompt, /realistic/i);
  assert.match(prompt, /not as a guaranteed outcome/i);
  assert.match(prompt, /fully clothed/i);
  assert.match(prompt, /Do not add.*measurements/i);
  assert.doesNotMatch(prompt, /exact body fat|exact weight/i);
});

test("transformation preview requires the canonical Pro entitlement", () => {
  const source = readFileSync(
    new URL("../src/transformationPreview.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /await requireProEntitlement\(uid\)/);
  assert.doesNotMatch(source, /paidScan|eligible paid scan/);
});

test("server plateau detector uses current scan schema and rejects failed scans", () => {
  const timestamp = (day) => ({ toMillis: () => Date.UTC(2026, 0, 1 + day) });
  const valid = (id, day, bf) => ({
    id,
    data: {
      status: "complete",
      createdAt: timestamp(day),
      input: { currentWeightKg: 80 },
      estimate: { bodyFatPercent: bf },
      resultSource: "ai",
    },
  });
  assert.equal(
    deriveServerPlateauSignature(
      [valid("a", 0, 25), valid("b", 14, 24.8), valid("c", 28, 24.9)],
      "lose_fat"
    ),
    "lose_fat:body_fat:c"
  );
  const failed = valid("b", 14, 24.8);
  failed.data.usedFallback = true;
  assert.equal(
    deriveServerPlateauSignature(
      [valid("a", 0, 25), failed, valid("c", 28, 24.9)],
      "lose_fat"
    ),
    null
  );
});

test("plateau push uses data-only web delivery and visible APNs delivery", () => {
  const web = buildPlateauMulticastMessage("web", ["web-token"]);
  assert.equal(web.notification, undefined);
  assert.equal(web.data.url, "/history");

  const ios = buildPlateauMulticastMessage("ios", ["ios-token"]);
  assert.equal(ios.notification.title, "Progress check-in");
  assert.equal(ios.apns.payload.aps.sound, "default");
  assert.match(ios.notification.body, /coaching prompt/i);
});

test("RevenueCat credit grants keep bucket totals as the balance source of truth", () => {
  const source = readFileSync(
    new URL("../src/revenueCatWebhook.ts", import.meta.url),
    "utf8"
  );
  assert.match(source, /grantCreditBuckets/);
  assert.doesNotMatch(source, /currentCredits/);
  assert.doesNotMatch(source, /credits:\s*currentCredits/);
});

test("USDA search filters are sent as JSON arrays for search and barcode fallback", () => {
  const searchSource = readFileSync(
    new URL("../src/nutritionSearch.ts", import.meta.url),
    "utf8"
  );
  assert.match(
    searchSource,
    /method:\s*"POST"[\s\S]*dataType:\s*USDA_DATA_TYPES/
  );
  assert.doesNotMatch(searchSource, /searchParams\.set\("dataType"/);

  const barcodeSource = readFileSync(
    new URL("../src/nutritionBarcode.ts", import.meta.url),
    "utf8"
  );
  assert.match(
    barcodeSource,
    /method:\s*"POST"[\s\S]*dataType:\s*\["Branded"\]/
  );
  assert.doesNotMatch(barcodeSource, /searchParams\.set\("dataType"/);
});
