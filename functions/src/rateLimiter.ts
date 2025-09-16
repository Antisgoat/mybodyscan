const buckets = new Map<string, { tokens: number; lastRefill: number }>();

export function consumeToken(
  key: string,
  capacity: number,
  refillRatePerSecond: number,
  cost = 1
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) || { tokens: capacity, lastRefill: now };
  const delta = (now - bucket.lastRefill) / 1000;
  if (delta > 0) {
    const refill = delta * refillRatePerSecond;
    bucket.tokens = Math.min(capacity, bucket.tokens + refill);
    bucket.lastRefill = now;
  }
  if (bucket.tokens < cost) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= cost;
  buckets.set(key, bucket);
  return true;
}
