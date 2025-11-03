const memoryCache = new Map<string, unknown>();

export function getCache<T>(key: string): T | undefined {
  return memoryCache.get(key) as T | undefined;
}

export function setCache<T>(key: string, value: T): T {
  memoryCache.set(key, value as unknown);
  return value;
}

export function clearCache(key?: string) {
  if (typeof key === "string") {
    memoryCache.delete(key);
    return;
  }
  memoryCache.clear();
}
