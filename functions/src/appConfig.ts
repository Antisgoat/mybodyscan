export type ScanProvider = "mock" | "leanlense";

/** Determine which scan provider to use at runtime. */
export function getScanProvider(): ScanProvider {
  const raw = (process.env.SCAN_PROVIDER || "mock").toLowerCase();
  if (raw === "leanlense") return "leanlense";
  return "mock";
}

export function getLeanLenseConfig(): { endpoint?: string; secret?: string } {
  return {
    endpoint: process.env.LEANLENSE_ENDPOINT,
    secret: process.env.LEANLENSE_SECRET || process.env.LEANLENSE_API_KEY,
  };
}
