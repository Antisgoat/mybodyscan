export type ScanFlowState =
  | "idle"
  | "preparing"
  | "uploading"
  | "submitting"
  | "queued"
  | "processing"
  | "complete"
  | "failed";

export type ScanFlowEvent =
  | { type: "start" }
  | { type: "prepared" }
  | { type: "uploading" }
  | { type: "submitted" }
  | { type: "queued" }
  | { type: "processing" }
  | { type: "complete" }
  | { type: "failed" };

const transitions: Record<ScanFlowState, ScanFlowState[]> = {
  idle: ["preparing", "failed"],
  preparing: ["uploading", "failed"],
  uploading: ["submitting", "failed"],
  submitting: ["queued", "failed"],
  queued: ["processing", "failed"],
  processing: ["complete", "failed"],
  complete: ["complete"],
  failed: ["failed"],
};

export function transitionState(current: ScanFlowState, next: ScanFlowState): ScanFlowState {
  const allowed = transitions[current] ?? [];
  if (allowed.includes(next)) return next;
  // Allow “healing” transitions when data arrives late (e.g., queued → processing).
  if (current === "failed" && next !== "failed") return next;
  return current;
}

export function deriveStateFromEvents(events: ScanFlowEvent[]): ScanFlowState {
  let state: ScanFlowState = "idle";
  for (const evt of events) {
    switch (evt.type) {
      case "start":
        state = transitionState(state, "preparing");
        break;
      case "prepared":
        state = transitionState(state, "uploading");
        break;
      case "submitted":
        state = transitionState(state, "submitting");
        break;
      case "queued":
        state = transitionState(state, "queued");
        break;
      case "processing":
        state = transitionState(state, "processing");
        break;
      case "complete":
        state = transitionState(state, "complete");
        break;
      case "failed":
        state = transitionState(state, "failed");
        break;
    }
  }
  return state;
}
