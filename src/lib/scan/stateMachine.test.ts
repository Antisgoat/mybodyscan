import { describe, expect, it } from "vitest";
import { deriveStateFromEvents, transitionState, type ScanFlowState } from "./stateMachine";

describe("scan state machine", () => {
  it("allows forward progress and guards invalid jumps", () => {
    let state: ScanFlowState = "idle";
    state = transitionState(state, "preparing");
    state = transitionState(state, "uploading");
    state = transitionState(state, "submitting");
    state = transitionState(state, "queued");
    expect(state).toBe("queued");
    const frozen = transitionState(state, "preparing");
    expect(frozen).toBe("queued");
  });

  it("derives state from event list", () => {
    const result = deriveStateFromEvents([
      { type: "start" },
      { type: "prepared" },
      { type: "uploading" },
      { type: "submitted" },
      { type: "queued" },
      { type: "processing" },
      { type: "complete" },
    ]);
    expect(result).toBe("complete");
  });
});
