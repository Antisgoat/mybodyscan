import { useEffect, useMemo, useState } from "react";
import { isAppCheckActive } from "@/appCheck";
import { isProviderEnabled, loadFirebaseAuthClientConfig } from "@/lib/firebaseAuthConfig";

function useQueryParam(name: string): string | null {
  return useMemo(() => {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }, [name]);
}

export default function DevDebugPanel() {
  // Dev-only panel; ensure we never render in prod
  if (!import.meta.env.DEV) return null;

  const debugFlag = useQueryParam("debug");
  const show = debugFlag === "1" || debugFlag === "true";
  const [host, setHost] = useState<string>("");
  const [appCheck, setAppCheck] = useState<boolean>(false);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setHost(window.location.hostname || "");
    setAppCheck(isAppCheckActive());
    // Re-check asynchronously once app initialization completes
    const id = window.setTimeout(() => setAppCheck(isAppCheckActive()), 500);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadFirebaseAuthClientConfig()
      .then((config) => {
        if (cancelled) return;
        setGoogleEnabled(isProviderEnabled("google.com", config));
      })
      .catch(() => {
        if (!cancelled) setGoogleEnabled(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 12,
        bottom: 12,
        zIndex: 9999,
        maxWidth: 360,
      }}
      className="rounded-md border bg-background/95 backdrop-blur px-3 py-2 shadow-lg text-sm"
    >
      <div className="font-medium mb-1">Dev Debug</div>
      <ul className="space-y-1 text-muted-foreground">
        <li>
          <span className="font-medium text-foreground">Host:</span> {host || ""}
        </li>
        <li>
          <span className="font-medium text-foreground">AppCheck active:</span> {appCheck ? "yes" : "no"}
        </li>
        <li>
          <span className="font-medium text-foreground">Google provider:</span>{" "}
          {googleEnabled == null ? "unknown" : googleEnabled ? "enabled" : "disabled"}
        </li>
      </ul>
    </div>
  );
}
