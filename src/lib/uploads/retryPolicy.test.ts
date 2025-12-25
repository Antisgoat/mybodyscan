import { describe, expect, it } from "vitest";
import { classifyUploadRetryability, getUploadStallReason } from "@/lib/uploads/retryPolicy";

describe("classifyUploadRetryability", () => {
  it("retries when offline", () => {
    expect(
      classifyUploadRetryability({ code: "storage/unknown", bytesTransferred: 1024, wasOffline: true })
    ).toEqual({ retryable: true, reason: "transient_network" });
  });

  it("does not retry unauthorized uploads", () => {
    expect(
      classifyUploadRetryability({ code: "storage/unauthorized", bytesTransferred: 0 })
    ).toEqual({ retryable: false, reason: "unauthorized" });
  });

  it("retries stalled uploads", () => {
    expect(classifyUploadRetryability({ code: "upload_paused" })).toEqual({
      retryable: true,
      reason: "stall",
    });
  });

  it("retries unknown errors only when no bytes were transferred", () => {
    expect(classifyUploadRetryability({ code: "", bytesTransferred: 0 })).toEqual({
      retryable: true,
      reason: "unknown_no_bytes",
    });
    expect(classifyUploadRetryability({ code: "", bytesTransferred: 2048 })).toEqual({
      retryable: false,
      reason: "non_retryable",
    });
  });

  it("treats upload timeouts as transient", () => {
    expect(classifyUploadRetryability({ code: "upload_timeout" })).toEqual({
      retryable: true,
      reason: "transient_network",
    });
  });

  it("does not retry unauthorized function responses", () => {
    expect(classifyUploadRetryability({ code: "function/permission-denied" })).toEqual({
      retryable: false,
      reason: "unauthorized",
    });
  });
});

describe("getUploadStallReason", () => {
  it("flags paused uploads that exceed stall timeout", () => {
    const now = Date.now();
    const reason = getUploadStallReason({
      lastBytes: 100,
      lastBytesAt: now - 30_000,
      lastState: "paused",
      now,
      stallTimeoutMs: 10_000,
    });
    expect(reason).toBe("paused");
  });
});
