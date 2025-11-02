import { useSyncExternalStore } from "react";

export type CaptureMode = "4";
export type CaptureView = "Front" | "Side" | "Back" | "Left" | "Right";

export const CAPTURE_VIEW_SETS: Record<CaptureMode, CaptureView[]> = {
  "4": ["Front", "Back", "Left", "Right"],
};

interface CaptureState {
  mode: CaptureMode;
  files: Partial<Record<CaptureView, File>>;
}

let state: CaptureState = {
  mode: "4",
  files: {},
};

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

export function pruneCaptureFiles(validViews: CaptureView[]) {
  const validSet = new Set(validViews);
  const nextFiles: Partial<Record<CaptureView, File>> = {};
  for (const [view, file] of Object.entries(state.files) as [CaptureView, File][]) {
    if (validSet.has(view)) {
      nextFiles[view] = file;
    }
  }
  setState({
    ...state,
    files: nextFiles,
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
