import { logger } from "firebase-functions";

function isEmulator(): boolean {
  return process.env.FUNCTIONS_EMULATOR === "true" || process.env.NODE_ENV !== "production";
}

const validatedKeys = new Set<string>();

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
    validatedKeys.add(name);
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
