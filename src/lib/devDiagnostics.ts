type PermissionDeniedSnapshot = {
  atMs: number;
  code?: string;
  message?: string;
  path?: string;
  op?: string;
};

let lastPermissionDenied: PermissionDeniedSnapshot | null = null;

function isPermissionDeniedLike(err: any): boolean {
  const code = err?.code ?? err?.status ?? "";
  if (code === 403) return true;
  const str = String(code || "");
  return str === "permission-denied" || str === "permission_denied" || str.includes("permission-denied");
}

/**
 * Record the last permission-denied style error for quick debugging.
 * Safe to call in production; only rendered in dev/admin UI.
 */
export function recordPermissionDenied(
  err: any,
  meta?: { path?: string; op?: string }
) {
  if (!isPermissionDeniedLike(err)) return;
  lastPermissionDenied = {
    atMs: Date.now(),
    code: typeof err?.code === "string" ? err.code : String(err?.status ?? "permission-denied"),
    message: typeof err?.message === "string" ? err.message : String(err),
    path: meta?.path,
    op: meta?.op,
  };
}

export function getLastPermissionDenied(): PermissionDeniedSnapshot | null {
  return lastPermissionDenied;
}

