import { useEffect, useState } from "react";
import {
  ensureAppCheck,
  getAppCheckTokenHeader,
  hasAppCheck,
} from "@/lib/appCheck";

type AppCheckState =
  | { status: "checking"; tokenPresent: boolean; message?: string }
  | { status: "ready"; tokenPresent: true; message?: string }
  | { status: "missing"; tokenPresent: false; message?: string };

export function useAppCheckStatus(): AppCheckState {
  const [state, setState] = useState<AppCheckState>({
    status: "checking",
    tokenPresent: false,
  });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!hasAppCheck()) {
          if (active)
            setState({
              status: "missing",
              tokenPresent: false,
              message: "App Check is not configured.",
            });
          return;
        }
        await ensureAppCheck();
        const headers = await getAppCheckTokenHeader();
        if (!active) return;
        const tokenPresent = Boolean(headers["X-Firebase-AppCheck"]);
        setState(
          tokenPresent
            ? { status: "ready", tokenPresent: true }
            : {
                status: "missing",
                tokenPresent: false,
                message: "No App Check token was issued.",
              }
        );
      } catch (error: any) {
        if (!active) return;
        const message =
          typeof error?.message === "string" && error.message.length
            ? error.message
            : undefined;
        setState({ status: "missing", tokenPresent: false, message });
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return state;
}
