import { reportError } from "@/lib/telemetry";

type PerfMark = {
  name: string;
  at: number;
  pose?: string;
  scanId?: string;
  bytes?: number;
};

type PerfMeasure = {
  name: string;
  start: number;
  end: number;
  duration: number;
  pose?: string;
  scanId?: string;
  bytes?: number;
};

const marks: PerfMark[] = [];
const measures: PerfMeasure[] = [];

const isProd = typeof import.meta !== "undefined" && !import.meta.env?.DEV;

export function mark(name: string, info?: { pose?: string; scanId?: string; bytes?: number }) {
  marks.push({
    name,
    at: Date.now(),
    pose: info?.pose,
    scanId: info?.scanId,
    bytes: info?.bytes,
  });
}

export function measure(
  name: string,
  start: string,
  end: string,
  info?: { pose?: string; scanId?: string; bytes?: number }
): void {
  const startMark = findLastMark(start);
  const endMark = findLastMark(end);
  if (!startMark || !endMark) return;
  measures.push({
    name,
    start: startMark.at,
    end: endMark.at,
    duration: Math.max(0, endMark.at - startMark.at),
    pose: info?.pose ?? startMark.pose ?? endMark.pose,
    scanId: info?.scanId ?? startMark.scanId ?? endMark.scanId,
    bytes: info?.bytes ?? startMark.bytes ?? endMark.bytes,
  });
}

function findLastMark(name: string): PerfMark | undefined {
  for (let i = marks.length - 1; i >= 0; i -= 1) {
    if (marks[i]?.name === name) return marks[i];
  }
  return undefined;
}

export async function flush(): Promise<void> {
  if (!marks.length && !measures.length) return;
  const payload = {
    kind: "scan_perf",
    marks: marks.splice(0, marks.length),
    measures: measures.splice(0, measures.length),
  };
  if (!isProd) {
    // eslint-disable-next-line no-console
    console.debug("[scan perf]", payload);
    return;
  }
  try {
    await reportError({
      kind: "scan_perf",
      message: "scan_perf_flush",
      extra: payload,
    });
  } catch {
    // ignore
  }
}
