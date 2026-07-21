function normalizeBucket(raw?: string): string | null {
  const value = String(raw || "").trim();
  if (!value) return null;
  return value.startsWith("gs://") ? value.slice(5) : value;
}

export function buildAdminAppOptions(
  env: NodeJS.ProcessEnv = process.env
): { storageBucket: string } | undefined {
  const storageBucket = normalizeBucket(
    env.STORAGE_BUCKET || env.FIREBASE_STORAGE_BUCKET
  );
  return storageBucket ? { storageBucket } : undefined;
}
