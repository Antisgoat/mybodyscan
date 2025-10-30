import { isCapacitor } from "@/lib/platform";

export function killSW() {
  if (isCapacitor()) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const reg of regs) {
        reg.unregister();
      }
    });
  } catch {
    // ignore
  }
}
