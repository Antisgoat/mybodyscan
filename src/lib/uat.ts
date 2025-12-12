import { useCallback, useState } from "react";
import type { User } from "firebase/auth";

import type { UserClaims } from "./claims";

export const UAT_EMAIL_ALLOWLIST = new Set(["developer@adlrlabs.com"]);

export type UatStatus = "idle" | "running" | "pass" | "fail" | "skip";

export interface UatProbeState<T = unknown> {
  status: UatStatus;
  timestamp?: number;
  durationMs?: number;
  code?: string | null;
  message?: string | null;
  data?: T | null;
  error?: string | null;
  httpStatus?: number;
}

export interface UatLogEntry {
  label: string;
  status: UatStatus;
  code?: string | null;
  message?: string | null;
  durationMs?: number;
  at: number;
}

export interface ProbeExecutionResult<T = unknown> {
  ok: boolean;
  status?: UatStatus;
  code?: string | null;
  message?: string | null;
  data?: T | null;
  httpStatus?: number;
}

type NormalizedError = {
  status?: UatStatus;
  code?: string | null;
  message: string;
  error?: string | null;
  httpStatus?: number;
};

export function resolveUatAccess(
  user: User | null,
  claims: UserClaims | null
): {
  allowed: boolean;
  email: string | null;
  reason: "dev" | "staff" | "allowlist" | "denied";
} {
  if (import.meta.env.DEV) {
    const email = user?.email?.toLowerCase() ?? null;
    return { allowed: true, email, reason: "dev" };
  }
  const emailFromUser = user?.email?.toLowerCase() ?? null;
  const emailFromClaims =
    typeof (claims as any)?.email === "string"
      ? (claims as any).email.toLowerCase()
      : null;
  const email = emailFromUser || emailFromClaims;
  if (claims?.staff === true) {
    return { allowed: true, email: email ?? null, reason: "staff" };
  }
  if (claims?.dev === true) {
    return { allowed: true, email: email ?? null, reason: "staff" };
  }
  if (email && UAT_EMAIL_ALLOWLIST.has(email)) {
    return { allowed: true, email, reason: "allowlist" };
  }
  return { allowed: false, email: email ?? null, reason: "denied" };
}

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      status: "skip",
      code: "aborted",
      message: "Request aborted",
      error: error.message,
    };
  }
  if (error && typeof error === "object") {
    const anyError = error as Record<string, unknown>;
    const code = typeof anyError.code === "string" ? anyError.code : null;
    const message =
      typeof anyError.message === "string" ? anyError.message : null;
    const httpStatus =
      typeof anyError.status === "number"
        ? (anyError.status as number)
        : undefined;
    return {
      code,
      message: message || code || "Probe failed",
      error: message || code,
      httpStatus,
    };
  }
  if (typeof error === "string") {
    return { message: error, error };
  }
  return { message: "Unknown error", error: error ? String(error) : null };
}

export function useProbe<T = unknown>(
  label: string,
  onLog?: (entry: UatLogEntry) => void
) {
  const [state, setState] = useState<UatProbeState<T>>({ status: "idle" });

  const run = useCallback(
    async (
      executor: () => Promise<ProbeExecutionResult<T>> | ProbeExecutionResult<T>
    ) => {
      const startedAt = performance.now();
      const startedTs = Date.now();
      setState({ status: "running", timestamp: startedTs });
      try {
        const result = await executor();
        const finishedAt = performance.now();
        const durationMs = Math.round(finishedAt - startedAt);
        const status: UatStatus =
          result.status ?? (result.ok ? "pass" : "fail");
        const next: UatProbeState<T> = {
          status,
          timestamp: Date.now(),
          durationMs,
          code: result.code ?? null,
          message: result.message ?? null,
          data: (result.data ?? null) as T | null,
          httpStatus: result.httpStatus,
          error: result.ok ? null : (result.message ?? null),
        };
        setState(next);
        onLog?.({
          label,
          status,
          code: next.code,
          message: next.message,
          durationMs,
          at: Date.now(),
        });
        return next;
      } catch (error) {
        const finishedAt = performance.now();
        const durationMs = Math.round(finishedAt - startedAt);
        const normalized = normalizeError(error);
        const status = normalized.status ?? "fail";
        const next: UatProbeState<T> = {
          status,
          timestamp: Date.now(),
          durationMs,
          code: normalized.code ?? null,
          message: normalized.message,
          error: normalized.error ?? normalized.message,
          httpStatus: normalized.httpStatus,
        };
        setState(next);
        onLog?.({
          label,
          status,
          code: next.code,
          message: next.message,
          durationMs,
          at: Date.now(),
        });
        return next;
      }
    },
    [label, onLog]
  );

  const reset = useCallback(() => {
    setState({ status: "idle" });
  }, []);

  return { state, run, reset } as const;
}

export function formatHttpStatus(status?: number): string | null {
  if (!status) return null;
  return `HTTP ${status}`;
}

export function toJsonText(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch (error) {
    return typeof value === "string" ? value : String(error ?? value);
  }
}
