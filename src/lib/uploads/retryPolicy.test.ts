import { describe, expect, it } from "vitest";
import { classifyUploadRetryability } from "@/lib/uploads/retryPolicy";

describe("classifyUploadRetryability", () => {
  it("does not retry unauthorized/canceled/invalid", () => {
    expect(classifyUploadRetryability({ code: "storage/unauthorized", bytesTransferred: 0 }).retryable).toBe(false);
    expect(classifyUploadRetryability({ code: "storage/canceled", bytesTransferred: 0 }).retryable).toBe(false);
    expect(classifyUploadRetryability({ code: "upload_cancelled", bytesTransferred: 0 }).retryable).toBe(false);
    expect(classifyUploadRetryability({ code: "storage/invalid-argument", bytesTransferred: 0 }).retryable).toBe(false);
  });

  it("retries stalls and retry-limit-exceeded", () => {
    expect(classifyUploadRetryability({ code: "upload_paused", bytesTransferred: 0 }).retryable).toBe(true);
    expect(classifyUploadRetryability({ code: "upload_stalled", bytesTransferred: 10 }).retryable).toBe(true);
    expect(classifyUploadRetryability({ code: "storage/retry-limit-exceeded", bytesTransferred: 10 }).retryable).toBe(true);
  });

  it("retries offline and unknown-without-bytes", () => {
    expect(classifyUploadRetryability({ wasOffline: true, bytesTransferred: 123 }).retryable).toBe(true);
    expect(classifyUploadRetryability({ code: "", bytesTransferred: 0 }).retryable).toBe(true);
    expect(classifyUploadRetryability({ code: "storage/unknown", bytesTransferred: 0 }).retryable).toBe(true);
  });

  it("does not retry unknown if bytes already transferred", () => {
    expect(classifyUploadRetryability({ code: "", bytesTransferred: 1000 }).retryable).toBe(false);
    expect(classifyUploadRetryability({ code: "storage/unknown", bytesTransferred: 1000 }).retryable).toBe(true);
  });
});

