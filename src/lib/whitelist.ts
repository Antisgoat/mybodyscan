import { getViteEnv } from "@app/lib/env.ts";

const DEFAULT_WHITELIST = ["developer@adlrlabs.com"];

function parseWhitelist(): string[] {
  const raw = getViteEnv("VITE_TEST_WHITELIST") ?? "";
  const fromEnv = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  const merged = new Set<string>([...DEFAULT_WHITELIST, ...fromEnv]);
  return Array.from(merged);
}

const CACHE = parseWhitelist();

export function getWhitelistedEmails(): string[] {
  return CACHE;
}

export function isWhitelistedEmail(email?: string | null): boolean {
  if (!email) return false;
  return CACHE.includes(email.trim().toLowerCase());
}
