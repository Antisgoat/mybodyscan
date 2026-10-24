// @vitest-environment node
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import parser from "postcss-selector-parser";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { ROOT_CONTEXT, trace } from "@opentelemetry/api";

const require = createRequire(import.meta.url);

describe("security-patched development tooling compatibility", () => {
  it("preserves selectors used by Tailwind, Radix and responsive layouts", () => {
    for (const selector of [
      ".hover\\:bg-primary:hover",
      ".md\\:grid-cols-2",
      '[data-state="open"] > .child:not(:first-child)',
      ":is(.dark .dark\\:text-white)",
      ".prose :where(p):not(:where([class~=not-prose],[class~=not-prose] *))",
    ])
      expect(parser().processSync(selector)).toBe(selector);
  });
  it("keeps Firebase Pub/Sub emulator topic construction compatible", async () => {
    const { PubSub } = require("@google-cloud/pubsub");
    const client = new PubSub({
      projectId: "demo-mbs",
      apiEndpoint: "127.0.0.1:8085",
    });
    expect(client.topic("security-test").name).toBe(
      "projects/demo-mbs/topics/security-test"
    );
    await client.close();
  });
  it("preserves the W3C tracing API used by the Firebase Pub/Sub emulator", () => {
    const propagator = new W3CTraceContextPropagator();
    const carrier = {
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
    };
    const result = propagator.extract(ROOT_CONTEXT, carrier, {
      get: (value, name) => value[name as keyof typeof value],
      keys: (value) => Object.keys(value),
    });
    expect(trace.getSpanContext(result)?.traceId).toBe(
      "4bf92f3577b34da6a3ce929d0e0e4736"
    );
  });
  it("keeps the Google HTTP client's CommonJS UUID dependency usable", () => {
    const fromGaxios = createRequire(require.resolve("gaxios"));
    const { v4, validate } = fromGaxios("uuid");
    expect(validate(v4())).toBe(true);
    expect(require("gaxios").Gaxios).toBeTypeOf("function");
  });
});
