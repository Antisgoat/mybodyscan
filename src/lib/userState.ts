const PROFILE_STATE_KEY = "mbs_profile_state";

interface StoredProfileState {
  lastWeightLb?: number;
  lastGoalWeightLb?: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readProfileState(): StoredProfileState {
  if (!isBrowser()) {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(PROFILE_STATE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredProfileState) : {};
  } catch {
    return {};
  }
}

function writeProfileState(state: StoredProfileState) {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(PROFILE_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore persistence errors
  }
}

function normalizeWeight(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 10) / 10;
}

function writeWeight(next: number | null, key: keyof StoredProfileState) {
  if (next == null) return;
  const normalized = normalizeWeight(next);
  if (normalized == null) return;
  const nextState: StoredProfileState = {
    ...readProfileState(),
    [key]: normalized,
  };
  writeProfileState(nextState);
}

export function getLastWeight(): number | null {
  const { lastWeightLb } = readProfileState();
  return typeof lastWeightLb === "number" && Number.isFinite(lastWeightLb) ? lastWeightLb : null;
}

export function getLastGoalWeight(): number | null {
  const { lastGoalWeightLb } = readProfileState();
  return typeof lastGoalWeightLb === "number" && Number.isFinite(lastGoalWeightLb) ? lastGoalWeightLb : null;
}

export function setLastWeight(lb: number) {
  writeWeight(lb, "lastWeightLb");
}

export function setLastGoalWeight(lb: number) {
  writeWeight(lb, "lastGoalWeightLb");
}
