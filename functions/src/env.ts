import { logger } from "firebase-functions";

function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV !== "production";
}

const validatedKeys = new Set<string>();
const warnedKeys = new Set<string>();

function markValidated(name: string, value: string | undefined): void {
  if (value) {
    validatedKeys.add(name);
  }
}

export function requireEnv(name: string, context: string): string {
  const value = process.env[name];
  if (!value) {
    const message = `${context}: missing required env var ${name}`;
    logger.error(message);
    if (!isEmulator()) {
      throw new Error(message);
    }
  }
  if (value) {
    markValidated(name, value);
    return value;
  }
  return "";
}

export function ensureEnvVars(names: string[], context: string): void {
  for (const name of names) {
    if (validatedKeys.has(name) && process.env[name]) {
      continue;
    }
    requireEnv(name, context);
  }
}

export function reportMissingEnv(name: string, context: string): void {
  if (process.env[name]) {
    return;
  }
  const message = `${context}: critical secret ${name} is not configured`;
  logger.error(message);
  if (!isEmulator()) {
    throw new Error(message);
  }
}

export function getEnvOrDefault(name: string, fallback: string): string {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  markValidated(name, raw);
  return raw;
}

export function getBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "t", "yes", "y", "on"].includes(normalized)) {
    markValidated(name, raw);
    return true;
  }
  if (["0", "false", "f", "no", "n", "off"].includes(normalized)) {
    markValidated(name, raw);
    return false;
  }
  if (!warnedKeys.has(name)) {
    logger.warn(`${name}: unable to parse boolean value (${raw}); falling back to ${fallback}`);
    warnedKeys.add(name);
  }
  return fallback;
}
