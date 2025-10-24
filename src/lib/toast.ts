export type ToastLevel = "info" | "error" | "success" | "warn";

export function toast(message: string, level: ToastLevel = "info"): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("mbs:toast", { detail: { message, level } }));
  } catch {
    if (typeof window !== "undefined") {
      try {
        // eslint-disable-next-line no-alert
        window.alert(message);
      } catch {
        // swallow errors to avoid crashing toast calls
      }
    }
  }
}

export function info(message: string) {
  toast(message, "info");
}

export function error(message: string) {
  toast(message, "error");
}

export function success(message: string) {
  toast(message, "success");
}

export function warn(message: string) {
  toast(message, "warn");
}
