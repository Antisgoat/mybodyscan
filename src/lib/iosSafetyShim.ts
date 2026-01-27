import { isIOSNativeRuntime } from "./platform";

type UnknownError = { name?: string; message?: string; stack?: string } | null;

function logWindowError(event: ErrorEvent): void {
  const err = event.error as UnknownError;
  const payload = {
    message: event.message,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: err?.stack,
  };
  console.error("[boot] window error:", payload);
}

function logUnhandledRejection(event: PromiseRejectionEvent): void {
  const reason = event.reason as UnknownError | string | undefined;
  const payload = {
    reason,
    stack: reason instanceof Error ? reason.stack : (reason as any)?.stack,
  };
  console.error("[boot] unhandledrejection:", payload);
}

function shouldSwallowDomError(error: unknown): boolean {
  const err = error as UnknownError;
  const name = err?.name ?? "";
  const message = err?.message ?? "";
  return name === "NotFoundError" || message.includes("The object can not be found here");
}

function installEarlyErrorHandlers(): void {
  if (typeof window === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__mbsEarlyErrorHandlersInstalled) return;
  anyWin.__mbsEarlyErrorHandlersInstalled = true;

  window.addEventListener("error", logWindowError, true);
  window.addEventListener("unhandledrejection", logUnhandledRejection, true);
}

function installIOSDomGuards(): void {
  if (!isIOSNativeRuntime()) return;
  if (typeof window === "undefined") return;
  const anyWin = window as any;
  if (anyWin.__mbsIOSDomGuardsInstalled) return;
  anyWin.__mbsIOSDomGuardsInstalled = true;

  const elementProto = Element.prototype as unknown as {
    setPointerCapture?: (pointerId: number) => void;
    releasePointerCapture?: (pointerId: number) => void;
  };

  const wrapElementMethod = (
    method: "setPointerCapture" | "releasePointerCapture"
  ) => {
    const original = elementProto[method];
    if (typeof original !== "function") return;
    elementProto[method] = function (pointerId: number) {
      try {
        return original.call(this, pointerId);
      } catch (error) {
        if (shouldSwallowDomError(error)) {
          return;
        }
        throw error;
      }
    };
  };

  wrapElementMethod("setPointerCapture");
  wrapElementMethod("releasePointerCapture");

  const nodeProto = Node.prototype as unknown as {
    removeChild?: (child: Node) => Node;
    insertBefore?: (node: Node, child: Node | null) => Node;
  };

  const wrapNodeMethod = (
    method: "removeChild" | "insertBefore"
  ) => {
    const original = nodeProto[method];
    if (typeof original !== "function") return;
    nodeProto[method] = function (...args: [Node, Node | null]) {
      try {
        return (original as any).apply(this, args);
      } catch (error) {
        if (shouldSwallowDomError(error)) {
          return args[0];
        }
        throw error;
      }
    };
  };

  wrapNodeMethod("removeChild");
  wrapNodeMethod("insertBefore");
}

installEarlyErrorHandlers();
installIOSDomGuards();
