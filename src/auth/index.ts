import type { AuthImpl } from "./facade";

export const auth: Promise<AuthImpl> = __MBS_NATIVE__
  ? import("./impl.native").then((m) => m.impl)
  : import("./impl.web").then((m) => m.impl);

export function loadAuthImpl(): Promise<AuthImpl> {
  return auth;
}
