import { useEffect, useRef, useState, type CSSProperties } from "react";

type NetState = { offline: boolean; msg?: string; t?: number };

type NetEventDetail = { message?: string };

export default function NetBanner() {
  const [state, setState] = useState<NetState>({
    offline: typeof navigator !== "undefined" ? !navigator.onLine : false,
  });
  const timerRef = useRef<number>();

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function clearTimer() {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    }

    function onOffline() {
      clearTimer();
      setState({ offline: true });
    }

    function onOnline() {
      clearTimer();
      setState({ offline: false });
    }

    function onNet(event: Event) {
      const detail = (event as CustomEvent<NetEventDetail>)?.detail;
      const message = detail?.message || "Network request failed.";
      const offline =
        typeof navigator !== "undefined" ? !navigator.onLine : false;
      const timestamp = Date.now();
      setState({ offline, msg: message, t: timestamp });
      if (!offline) {
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          setState((prev) =>
            prev.t === timestamp ? { offline: false } : prev
          );
        }, 4000);
      }
    }

    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    window.addEventListener("mbs:net:error", onNet as EventListener);

    return () => {
      clearTimer();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("mbs:net:error", onNet as EventListener);
    };
  }, []);

  const show = state.offline || Boolean(state.msg);
  if (!show) return null;

  const text = state.offline
    ? "You’re offline. Some features won’t work."
    : (state.msg ?? "");

  return (
    <div style={bar} role="status" aria-live="polite">
      {text}
    </div>
  );
}

const bar: CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: 0,
  padding: "8px 12px",
  background: "#fffbe6",
  borderTop: "1px solid #f0e6a8",
  color: "#705e00",
  fontSize: 13,
  zIndex: 9999,
  textAlign: "center",
};
