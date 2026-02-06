import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getOnlineStatus, subscribeOnlineStatus } from "@/lib/network";

type NetState = { offline: boolean; msg?: string; t?: number };

type NetEventDetail = { message?: string };

export default function NetBanner() {
  const [state, setState] = useState<NetState>({
    offline: false,
  });
  const timerRef = useRef<number>();
  const connectedRef = useRef(true);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    function clearTimer() {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    }

    function updateConnection(connected: boolean) {
      connectedRef.current = connected;
      clearTimer();
      setState((prev) => ({ ...prev, offline: !connected }));
    }

    function onNet(event: Event) {
      const detail = (event as CustomEvent<NetEventDetail>)?.detail;
      const message = detail?.message || "Network request failed.";
      const offline = !connectedRef.current;
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

    let active = true;
    void getOnlineStatus().then((status) => {
      if (!active) return;
      updateConnection(status.connected);
    });
    const unsubscribe = subscribeOnlineStatus((status) => {
      updateConnection(status.connected);
    });
    window.addEventListener("mbs:net:error", onNet as EventListener);

    return () => {
      active = false;
      clearTimer();
      unsubscribe();
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
