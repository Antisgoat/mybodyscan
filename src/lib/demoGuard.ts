import { isReadOnly, assertReadOnly } from "./demoFlag";

export function assertNotDemoWrite() {
  // Keep old behavior for callers, delegate to normalized guard
  assertReadOnly("write");
}

export function disabledIfDemo(): { disabled: boolean; title?: string } {
  return isReadOnly()
    ? { disabled: true, title: "Read-only demo mode" }
    : { disabled: false };
}
