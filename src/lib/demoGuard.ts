import { toast } from "@/hooks/use-toast";
import { isReadOnly } from "./demoFlag";

export function assertNotDemoWrite() {
  if (!isReadOnly()) {
    return;
  }

  toast({
    title: "Demo is read-only.",
    description: "Sign in with an account to save changes.",
  });

  const error: Error & { code?: string } = new Error("Read-only demo: write disabled");
  error.code = "demo/read-only";
  throw error;
}

export function disabledIfDemo(): { disabled: boolean; title?: string } {
  return isReadOnly()
    ? { disabled: true, title: "Demo browse only" }
    : { disabled: false };
}
