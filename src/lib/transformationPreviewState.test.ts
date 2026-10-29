import { expect, it } from "vitest";
import type { TransformationPreviewDocument } from "./transformationPreview";
import {
  isTransformationPreviewStale,
  TRANSFORMATION_PREVIEW_STALE_MS,
} from "./transformationPreviewState";

const pending = (fields = {}): TransformationPreviewDocument => ({
  scanId: "scan-a",
  status: "processing",
  goal: "recomp",
  timelineWeeks: 12,
  disclaimer: "Illustration",
  updatedAt: new Date(1000),
  ...fields,
});
it("does not retry work still inside the server lease", () => {
  expect(
    isTransformationPreviewStale(
      pending(),
      1000 + TRANSFORMATION_PREVIEW_STALE_MS - 1
    )
  ).toBe(false);
});
it("allows explicit recovery of abandoned queued or processing work", () => {
  for (const status of ["queued", "processing"] as const) {
    expect(
      isTransformationPreviewStale(
        pending({ status }),
        1000 + TRANSFORMATION_PREVIEW_STALE_MS
      )
    ).toBe(true);
  }
});
it("does not classify a finished preview or a future timestamp as abandoned", () => {
  expect(
    isTransformationPreviewStale(pending({ status: "ready" }), Infinity)
  ).toBe(false);
  expect(isTransformationPreviewStale(pending(), 500)).toBe(false);
});
it("fails closed for missing or invalid timestamps", () => {
  expect(isTransformationPreviewStale(pending({ updatedAt: null }), 1e9)).toBe(
    false
  );
  expect(
    isTransformationPreviewStale(pending({ updatedAt: new Date(NaN) }), 1e9)
  ).toBe(false);
});
it("uses the request timestamp if the update timestamp is absent", () => {
  expect(
    isTransformationPreviewStale(
      pending({ updatedAt: null, requestedAt: new Date(1000) }),
      1000 + TRANSFORMATION_PREVIEW_STALE_MS
    )
  ).toBe(true);
});
