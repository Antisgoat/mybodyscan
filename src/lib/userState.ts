const PROFILE_STATE_KEY = "mbs_profile_state";

interface StoredProfileState {
  lastWeightLb?: number;
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

export function getLastWeight(): number | null {
  const { lastWeightLb } = readProfileState();
  return typeof lastWeightLb === "number" && Number.isFinite(lastWeightLb) ? lastWeightLb : null;
}

export function setLastWeight(lb: number) {
  if (!Number.isFinite(lb) || lb <= 0) {
    return;
  }
  const normalized = Math.round(lb * 10) / 10;
  const nextState: StoredProfileState = {
    ...readProfileState(),
    lastWeightLb: normalized,
  };
  writeProfileState(nextState);
}
