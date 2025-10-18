import { toast } from "@/hooks/use-toast";
import { auth as firebaseAuth } from "@/lib/firebase";
import { isDemoUser } from "./auth";
import { isReadOnly } from "./demoFlag";

export function assertNotDemoWrite() {
  const currentUser = firebaseAuth?.currentUser ?? null;
  if (!isReadOnly() && !isDemoUser(currentUser)) {
    return;
  }

  toast({
    title: "Demo is read-only.",
    description: "Sign in with an account to save changes.",
    variant: "destructive",
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
