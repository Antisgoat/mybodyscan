/** Only exact user/scan prefixes; never trust client-supplied storage paths. */
export function scanMediaPrefixes(uid: string, scanId: string): string[] {
  if (
    ![uid, scanId].every(
      (value) =>
        typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value)
    )
  ) {
    throw new Error("invalid_scan_identifier");
  }
  return [
    `scans/${uid}/${scanId}/`,
    `transformation-previews/${uid}/${scanId}/`,
  ];
}

/** Preview functions time out after five minutes; stale failed leases must not block deletion forever. */
export function previewBlocksDeletion(
  data: { status?: unknown; updatedAt?: unknown } | undefined,
  now = Date.now()
): boolean {
  if (!["queued", "processing"].includes(String(data?.status))) return false;
  const timestamp = data?.updatedAt as { toMillis?: () => number } | undefined;
  const updated = timestamp?.toMillis?.();
  return (
    typeof updated !== "number" ||
    !Number.isFinite(updated) ||
    now - updated < 15 * 60 * 1000
  );
}

export async function deleteScanMediaAndRecords(
  uid: string,
  scanId: string,
  deps: {
    deletePrefix: (prefix: string) => Promise<unknown>;
    deleteRecords: () => Promise<unknown>;
  }
) {
  // Keep the scan record available for retry until every media deletion succeeds.
  for (const prefix of scanMediaPrefixes(uid, scanId))
    await deps.deletePrefix(prefix);
  await deps.deleteRecords();
}
