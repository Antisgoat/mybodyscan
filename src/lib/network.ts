import { Network } from "@capacitor/network";
import { isNativeCapacitor } from "@/lib/platform";

export type OnlineStatus = {
  connected: boolean;
  source: "capacitor" | "navigator" | "fallback";
};

export async function getOnlineStatus(): Promise<OnlineStatus> {
  if (isNativeCapacitor()) {
    try {
      const status = await Network.getStatus();
      return { connected: Boolean(status.connected), source: "capacitor" };
    } catch {
      // fall through to navigator
    }
  }

  if (typeof navigator !== "undefined" && "onLine" in navigator) {
    return { connected: Boolean(navigator.onLine), source: "navigator" };
  }

  return { connected: true, source: "fallback" };
}

export function subscribeOnlineStatus(
  callback: (status: OnlineStatus) => void
): () => void {
  if (isNativeCapacitor()) {
    try {
      const listener = Network.addListener("networkStatusChange", (status) => {
        callback({ connected: Boolean(status.connected), source: "capacitor" });
      });
      return () => {
        void listener.remove();
      };
    } catch {
      // fall through to web listeners
    }
  }

  if (typeof window !== "undefined") {
    const onOnline = () => callback({ connected: true, source: "navigator" });
    const onOffline = () => callback({ connected: false, source: "navigator" });
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }

  return () => undefined;
}
