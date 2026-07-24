import { isIOSNativeRuntime } from "./platform";

type UnknownError = { name?: string; message?: string; stack?: string } | null;

function shouldSwallowDomError(error: unknown): boolean {
  const err = error as UnknownError;
  const name = err?.name ?? "";
  const message = err?.message ?? "";
  return (
    name === "NotFoundError" ||
    message.includes("The object can not be found here")
  );
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

  const originalRemoveChild = nodeProto.removeChild;
  if (typeof originalRemoveChild === "function") {
    nodeProto.removeChild = function (child: Node): Node {
      try {
        return originalRemoveChild.call(this, child);
      } catch (error) {
        if (shouldSwallowDomError(error)) {
          return child;
        }
        throw error;
      }
    };
  }

  const originalInsertBefore = nodeProto.insertBefore;
  if (typeof originalInsertBefore === "function") {
    nodeProto.insertBefore = function (
      node: Node,
      child: Node | null
    ): Node {
      try {
        return originalInsertBefore.call(this, node, child);
      } catch (error) {
        if (shouldSwallowDomError(error)) {
          return node;
        }
        throw error;
      }
    };
  }
}

installIOSDomGuards();
