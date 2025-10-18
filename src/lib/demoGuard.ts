import { isReadOnly, assertReadOnly } from "./demoFlag.tsx";

export function assertNotDemoWrite() {
  // Keep old behavior for callers, delegate to normalized guard
  assertReadOnly("write");
}

export function disabledIfDemo(): { disabled: boolean; title?: string } {
  return isReadOnly()
    ? { disabled: true, title: "Demo browse only" }
    : { disabled: false };
}
