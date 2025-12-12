import { useEffect, useState } from "react";

import { useAuthUser } from "@/lib/auth";
import { DEMO_SESSION_KEY } from "@/lib/demoFlag";

export function DemoBadge() {
  const { user } = useAuthUser();
  const [sessionDemo, setSessionDemo] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      setSessionDemo(false);
      return;
    }
    try {
      setSessionDemo(window.sessionStorage.getItem(DEMO_SESSION_KEY) === "1");
    } catch {
      setSessionDemo(false);
    }
  }, [user?.uid, user?.isAnonymous]);

  const demo = Boolean(user?.isAnonymous && sessionDemo);
  if (!demo) return null;
  return (
    <span className="ml-2 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
      Demo
    </span>
  );
}
