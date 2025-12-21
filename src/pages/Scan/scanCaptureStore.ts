import { useSyncExternalStore } from "react";

export type CaptureMode = "4";
export type CaptureView = "Front" | "Side" | "Back" | "Left" | "Right";
export type PoseKey = "front" | "back" | "left" | "right";

export const CAPTURE_VIEW_SETS: Record<CaptureMode, CaptureView[]> = {
  "4": ["Front", "Back", "Left", "Right"],
};

interface CaptureState {
  mode: CaptureMode;
  files: Partial<Record<CaptureView, File>>;
  weights: {
    currentWeightKg: number | null;
    goalWeightKg: number | null;
  };
  session: {
    scanId: string;
    storagePaths: Record<PoseKey, string>;
    correlationId?: string;
  } | null;
}

function initialState(): CaptureState {
  return {
    mode: "4",
    files: {},
    weights: {
      currentWeightKg: null,
      goalWeightKg: null,
    },
    session: null,
  };
}

let state: CaptureState = initialState();

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function setState(nextState: CaptureState) {
  if (state === nextState) return;
  state = nextState;
  emit();
}

export function getCaptureState() {
  return state;
}

export function setCaptureMode(mode: CaptureMode) {
  if (state.mode === mode) return;
  setState({
    ...state,
    mode,
  });
}

export function setCaptureFile(view: CaptureView, file?: File) {
  const nextFiles = { ...state.files };
  if (!file) {
    delete nextFiles[view];
  } else {
    nextFiles[view] = file;
  }
  setState({
    ...state,
    files: nextFiles,
  });
}

export function clearCaptureFiles() {
  if (!Object.keys(state.files).length) return;
  setState({
    ...state,
    files: {},
  });
}

export function pruneCaptureFiles(validViews: CaptureView[]) {
  const validSet = new Set(validViews);
  const nextFiles: Partial<Record<CaptureView, File>> = {};
  for (const [view, file] of Object.entries(state.files) as [
    CaptureView,
    File,
  ][]) {
    if (validSet.has(view)) {
      nextFiles[view] = file;
    }
  }
  setState({
    ...state,
    files: nextFiles,
  });
}

export function setCaptureWeights(weights: {
  currentWeightKg: number;
  goalWeightKg: number;
}) {
  setState({
    ...state,
    weights: {
      currentWeightKg: weights.currentWeightKg,
      goalWeightKg: weights.goalWeightKg,
    },
    session: null,
  });
}

export function setCaptureSession(
  session: {
    scanId: string;
    storagePaths: Record<PoseKey, string>;
    correlationId?: string;
  } | null
) {
  setState({
    ...state,
    session,
  });
}

export function resetCaptureFlow(options?: { preserveWeights?: boolean }) {
  const next = initialState();
  const weights = options?.preserveWeights ? state.weights : next.weights;
  setState({
    ...next,
    weights,
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

export function useScanCaptureStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
