import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  subscribeOnlineStatus,
  type OnlineStatus,
} from "@/lib/network";

type NetState = { status: OnlineStatus; msg?: string; t?: number };

type NetEventDetail = { message?: string };

export default function NetBanner() {
  const [state, setState] = useState<NetState>({
    status:
      typeof navigator !== "undefined" && navigator.onLine === false
        ? "offline"
        : "unknown",
  });
  const timerRef = useRef<number>();
  const statusRef = useRef<OnlineStatus>(state.status);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function clearTimer() {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    }

    function onNet(event: Event) {
      const detail = (event as CustomEvent<NetEventDetail>)?.detail;
      const message = detail?.message || "Network request failed.";
      const timestamp = Date.now();
      setState((prev) => ({ ...prev, msg: message, t: timestamp }));
      if (statusRef.current !== "offline") {
        clearTimer();
        timerRef.current = window.setTimeout(() => {
          setState((prev) =>
            prev.t === timestamp ? { ...prev, msg: undefined } : prev
          );
        }, 4000);
      }
    }

    const unsubscribe = subscribeOnlineStatus((status) => {
      statusRef.current = status;
      setState((prev) => ({ ...prev, status }));
    });
    window.addEventListener("mbs:net:error", onNet as EventListener);

    return () => {
      clearTimer();
      unsubscribe();
      window.removeEventListener("mbs:net:error", onNet as EventListener);
    };
  }, []);

  const show = state.status === "offline" || Boolean(state.msg);
  if (!show) return null;

  const text = state.status === "offline"
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
