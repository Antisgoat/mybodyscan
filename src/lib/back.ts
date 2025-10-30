import { useEffect, useRef } from "react";
import { isAndroidWebView, isCapacitor, isWeb } from "./platform";

const DEFAULT_CONFIRM_MESSAGE = "Going back may cancel the current action. Continue?";

type BackGuard = {
  shouldBlock: () => boolean;
  getMessage?: () => string | undefined;
  onConfirm?: () => void;
};

let initialized = false;
let allowNextPop = false;
let guards: Array<{ id: number; guard: BackGuard }> = [];
let activeGuard: BackGuard | null = null;
let guardIdSeq = 0;

function evaluateActiveGuard() {
  activeGuard = guards.length ? guards[guards.length - 1]!.guard : null;
}

function pushGuard(guard: BackGuard): () => void {
  const id = ++guardIdSeq;
  guards = [...guards, { id, guard }];
  evaluateActiveGuard();
  return () => {
    guards = guards.filter((entry) => entry.id !== id);
    evaluateActiveGuard();
  };
}

function ensureHistorySentinel() {
  if (!isWeb()) return;
  try {
    window.history.pushState({ __mbsSentinel: Date.now() }, document.title, window.location.href);
  } catch {
    // ignore
  }
}

function handlePopState(event: PopStateEvent) {
  if (allowNextPop) {
    allowNextPop = false;
    return;
  }

  if (!activeGuard) return;
  if (!activeGuard.shouldBlock()) return;

  if (typeof event.preventDefault === "function") {
    event.preventDefault();
  }

  ensureHistorySentinel();
  const message = activeGuard.getMessage?.() ?? DEFAULT_CONFIRM_MESSAGE;
  const proceed = typeof window !== "undefined" && typeof window.confirm === "function"
    ? window.confirm(message)
    : true;

  if (proceed) {
    allowNextPop = true;
    try {
      activeGuard.onConfirm?.();
    } catch {
      // ignore guard errors to avoid breaking navigation
    }
    if (typeof window !== "undefined") {
      window.history.back();
    }
  }
}

export function initBackHandler() {
  if (initialized) return;
  if (!isWeb()) return;
  if (!isAndroidWebView() && !isCapacitor()) return;

  ensureHistorySentinel();
  window.addEventListener("popstate", handlePopState);
  initialized = true;
}

type GuardOptions = {
  message?: string;
  onConfirm?: () => void;
};

export function useBackNavigationGuard(
  shouldBlock: () => boolean,
  options?: GuardOptions,
): void {
  const shouldBlockRef = useRef(shouldBlock);
  const messageRef = useRef(options?.message);
  const confirmRef = useRef(options?.onConfirm);

  useEffect(() => {
    shouldBlockRef.current = shouldBlock;
  }, [shouldBlock]);

  useEffect(() => {
    messageRef.current = options?.message;
  }, [options?.message]);

  useEffect(() => {
    confirmRef.current = options?.onConfirm;
  }, [options?.onConfirm]);

  useEffect(() => {
    if (!isAndroidWebView() && !isCapacitor()) {
      return () => undefined;
    }

    const remove = pushGuard({
      shouldBlock: () => {
        try {
          return shouldBlockRef.current?.() ?? false;
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn("[back] guard shouldBlock threw", error);
          }
          return false;
        }
      },
      getMessage: () => messageRef.current,
      onConfirm: () => {
        try {
          confirmRef.current?.();
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn("[back] guard onConfirm threw", error);
          }
        }
      },
    });

    return remove;
  }, []);
}
