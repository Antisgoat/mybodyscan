import { DEMO_MODE } from "@/env";

export function assertNotDemoWrite() {
  if (DEMO_MODE) {
    const err = new Error("Read-only demo mode");
    (err as any).code = "demo/read-only";
    throw err;
  }
}

export function disabledIfDemo(): { disabled: boolean; title?: string } {
  return DEMO_MODE
    ? { disabled: true, title: "Read-only demo (sign up to save changes)" }
    : { disabled: false };
}
