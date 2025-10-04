import { isDemoActive } from "./demoFlag";

export function assertNotDemoWrite() {
  if (isDemoActive()) {
    const err = new Error("Read-only demo mode");
    (err as any).code = "demo/read-only";
    throw err;
  }
}

export function disabledIfDemo(): { disabled: boolean; title?: string } {
  return isDemoActive() ? { disabled: true, title: "Read-only demo mode" } : { disabled: false };
}
