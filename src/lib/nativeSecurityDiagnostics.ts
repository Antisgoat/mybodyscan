export type NativeSecurityDiagnosticReason = {
  type: "network_blocked" | "script_blocked" | "csp_violation";
  message: string;
  detail?: Record<string, unknown>;
  timestampMs: number;
};

let lastNativeSecurityReason: NativeSecurityDiagnosticReason | null = null;

export function recordNativeSecurityReason(
  reason: Omit<NativeSecurityDiagnosticReason, "timestampMs">
): void {
  lastNativeSecurityReason = {
    ...reason,
    timestampMs: Date.now(),
  };
}

export function getLastNativeSecurityReason(): NativeSecurityDiagnosticReason | null {
  return lastNativeSecurityReason;
}

export function clearLastNativeSecurityReason(): void {
  lastNativeSecurityReason = null;
}
