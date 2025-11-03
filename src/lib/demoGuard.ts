import { isDemo } from "./demo";

function notify(feature: string) {
  const message = feature
    ? `Sign up to use ${feature}. You're viewing the demo.`
    : "Sign up to use this feature. You're viewing the demo.";

  if (typeof window === "undefined") return;
  let handled = false;
  try {
    window.dispatchEvent(
      new CustomEvent("mbs:toast", {
        detail: {
          level: "info",
          message,
        },
      }),
    );
    handled = true;
  } catch {
    /* ignore */
  }

  try {
    const api = (window as unknown as { toast?: { info?: (msg: string) => void } }).toast;
    if (api?.info) {
      api.info(message);
      handled = true;
    }
  } catch {
    /* ignore */
  }

  if (!handled) {
    try {
      if (typeof window.alert === "function") {
        window.alert(message);
      }
    } catch {
      /* ignore */
    }
  }
}

export function demoGuard(feature: string): boolean {
  if (!isDemo()) return true;
  notify(feature);
  return false;
}

export function assertNotDemoWrite() {
  if (!demoGuard("this action")) {
    throw new Error("demo/read-only");
  }
}

export function disabledIfDemo(): { disabled: boolean; title?: string } {
  return isDemo()
    ? { disabled: true, title: "Read-only demo mode" }
    : { disabled: false };
}
