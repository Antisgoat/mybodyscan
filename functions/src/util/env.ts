export function readSecret(
  name: string,
  fallbackEnvNames: string[]
): { present: boolean; value?: string } {
  const candidates = [name, ...fallbackEnvNames];

  for (const candidate of candidates) {
    const raw = process.env[candidate];
    if (typeof raw !== "string") {
      continue;
    }
    const value = raw.trim();
    if (!value) {
      continue;
    }
    return { present: true, value };
  }

  return { present: false };
}
