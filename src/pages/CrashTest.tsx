import { useEffect } from "react";

export function CrashTest() {
  useEffect(() => {
    // Force an uncaught error on mount to exercise ErrorBoundary
    throw new Error("Intentional crash for test");
  }, []);
  return null;
}
