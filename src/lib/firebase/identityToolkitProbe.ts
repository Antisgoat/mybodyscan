const TRUTHY = new Set(["1", "true", "yes", "on", "enabled"]);
const FALSY = new Set(["0", "false", "no", "off", "disabled"]);

function normalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function readFlag(): string {
  const primary = normalize((import.meta.env as Record<string, unknown>)?.VITE_IDENTITY_PROBE);
  if (primary) return primary;
  return normalize((import.meta.env as Record<string, unknown>)?.VITE_ENABLE_IDENTITY_PROBES);
}

export function isIdentityToolkitProbeEnabled(): boolean {
  const flag = readFlag();
  if (flag) {
    if (TRUTHY.has(flag)) return true;
    if (FALSY.has(flag)) return false;
  }
  return Boolean(import.meta.env.DEV);
}
