export type ToastLevel = "info" | "error" | "success" | "warn";

export function toast(message: string, level: ToastLevel = "info"): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("mbs:toast", { detail: { message, level } })
    );
  } catch (error) {
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.warn("[toast] dispatch failed", error, message);
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
