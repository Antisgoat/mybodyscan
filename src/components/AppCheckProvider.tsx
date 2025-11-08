import { useEffect, useState, type PropsWithChildren } from "react";
import { ensureAppCheck } from "@/lib/appCheck";

export function AppCheckProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    ensureAppCheck().finally(() => setReady(true));
  }, []);

  return ready ? <>{children}</> : null;
}
