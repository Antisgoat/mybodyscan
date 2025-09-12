export const missingEnvVars: string[] = [];

export function getEnv(key: string, defaultValue = ""): string {
  const value = (import.meta.env as Record<string, string | undefined>)[key] ?? defaultValue;
  if (!value && import.meta.env.DEV) {
    missingEnvVars.push(key);
  }
  return value;
}
