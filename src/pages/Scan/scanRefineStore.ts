import { useSyncExternalStore } from "react";

export type ManualInputKey = "neck" | "waist" | "hip";

export interface ManualInputsState {
  neck: string;
  waist: string;
  hip: string;
}

export interface ManualCircumferences {
  neckIn?: number;
  waistIn?: number;
  hipIn?: number;
}

interface ScanRefineState {
  manualInputs: ManualInputsState;
  photoCircumferences: ManualCircumferences | null;
}

const EMPTY_MANUAL_INPUTS: ManualInputsState = {
  neck: "",
  waist: "",
  hip: "",
};

let state: ScanRefineState = {
  manualInputs: { ...EMPTY_MANUAL_INPUTS },
  photoCircumferences: null,
};

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

function setState(next: ScanRefineState) {
  if (state === next) return;
  state = next;
  emit();
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

export function useScanRefineStore() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function sanitizeCircumference(
  value: number | undefined | null
): number | undefined {
  if (!Number.isFinite(value ?? NaN)) return undefined;
  if (!value || value <= 0) return undefined;
  return roundToTenth(value);
}

function normalizeInputsWithPhoto(
  manual: ManualInputsState,
  photo: ManualCircumferences | null
): ManualInputsState {
  if (!photo) return manual;
  const next: ManualInputsState = { ...manual };
  if (!next.neck && photo.neckIn != null) {
    next.neck = roundToTenth(photo.neckIn).toString();
  }
  if (!next.waist && photo.waistIn != null) {
    next.waist = roundToTenth(photo.waistIn).toString();
  }
  if (!next.hip && photo.hipIn != null) {
    next.hip = roundToTenth(photo.hipIn).toString();
  }
  return next;
}

export function setPhotoCircumferences(
  circumferences: ManualCircumferences | null
) {
  const sanitized: ManualCircumferences | null = circumferences
    ? {
        neckIn: sanitizeCircumference(circumferences.neckIn),
        waistIn: sanitizeCircumference(circumferences.waistIn),
        hipIn: sanitizeCircumference(circumferences.hipIn),
      }
    : null;

  setState({
    manualInputs: normalizeInputsWithPhoto(state.manualInputs, sanitized),
    photoCircumferences: sanitized,
  });
}

export function setManualInput(field: ManualInputKey, value: string) {
  const nextManualInputs: ManualInputsState = {
    ...state.manualInputs,
    [field]: value,
  };
  setState({
    manualInputs: nextManualInputs,
    photoCircumferences: state.photoCircumferences,
  });
}

export function commitManualInput(field: ManualInputKey, value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    setManualInput(field, "");
    return;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    setManualInput(field, "");
    return;
  }

  const rounded = roundToTenth(parsed);
  setManualInput(field, rounded.toString());
}

export function resetManualInputs() {
  setState({
    manualInputs: { ...EMPTY_MANUAL_INPUTS },
    photoCircumferences: state.photoCircumferences,
  });
}
