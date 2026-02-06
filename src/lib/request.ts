export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 8000,
  label?: string
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const err = new Error(label ? `${label} timed out` : "timeout");
      (err as Error & { code?: string; label?: string }).code = "timeout";
      (err as Error & { code?: string; label?: string }).label = label;
      reject(err);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
