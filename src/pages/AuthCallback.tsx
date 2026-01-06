import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { consumeAuthRedirect } from "@/lib/auth/redirectState";
import { isNative } from "@/lib/platform";

export default function AuthCallbackPage() {
  const nav = useNavigate();
  const [msg, setMsg] = useState("Finishing sign-in…");

  useEffect(() => {
    let alive = true;
    (async () => {
      // This route is web-only. On native, jump to home.
      if (!isNative()) {
        const { handleAuthRedirectResult } = await import("@/lib/auth/providers");
        await handleAuthRedirectResult();
      }
      if (!alive) return;
      const next = consumeAuthRedirect() ?? "/home";
      setMsg("Signed in. Redirecting…");
      setTimeout(() => nav(next), 10);
    })();
    return () => {
      alive = false;
    };
  }, [nav]);

  return (
    <div className="mx-auto max-w-sm p-6">
      <h1 className="text-base font-semibold">MyBodyScan</h1>
      <p className="mt-2 text-sm text-muted-foreground">{msg}</p>
      <div className="mt-3 h-2 w-1/2 bg-black/10 animate-pulse" />
    </div>
  );
}
