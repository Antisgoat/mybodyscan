export type AnyErr = unknown;

export function errorCode(err: AnyErr): string {
  const maybe = err as any;
  const code = maybe && typeof maybe === "object" ? maybe.code : undefined;
  return typeof code === "string" && code.length > 0 ? code : "internal";
}

export function statusFromCode(code: string): number {
  switch (code) {
    case "unauthenticated": return 401;
    case "permission-denied": return 403;
    case "not-found": return 404;
    case "invalid-argument":
    case "failed-precondition": return 400;
    case "resource-exhausted": return 429;
    case "unavailable": return 503;
    default: return 500;
  }
}
