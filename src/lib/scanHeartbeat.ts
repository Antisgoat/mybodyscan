export type HeartbeatInputs = {
  updatedAt?: Date | number | null;
  heartbeatAt?: Date | number | null;
  lastStepAt?: Date | number | null;
};

function toMillis(value: Date | number | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return null;
}

export function latestHeartbeatMillis(inputs: HeartbeatInputs): number | null {
  const values = [
    toMillis(inputs.updatedAt),
    toMillis(inputs.heartbeatAt),
    toMillis(inputs.lastStepAt),
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (!values.length) return null;
  return Math.max(...values);
}

export function computeProcessingTimeouts(params: {
  startedAt: number;
  lastHeartbeatAt: number | null;
  now?: number;
  warningMs: number;
  timeoutMs: number;
}): { showLongProcessing: boolean; hardTimeout: boolean; elapsedMs: number } {
  const now = typeof params.now === "number" ? params.now : Date.now();
  const base = params.lastHeartbeatAt ?? params.startedAt;
  const elapsedMs = Math.max(0, now - Math.max(params.startedAt, base));
  return {
    showLongProcessing: elapsedMs >= params.warningMs,
    hardTimeout: elapsedMs >= params.timeoutMs,
    elapsedMs,
  };
}
