import { useEffect, useState, type CSSProperties } from "react";

import { FUNCTIONS_ORIGIN } from "@/config/backend";
import { firebaseApiKey } from "../lib/firebase";

type HealthSnapshot = {
  identityToolkitReachable?: boolean;
  identityToolkitReason?: string;
};

export default function SetupBanner() {
  const [message, setMessage] = useState<string | null>(null);
  const allowInternalTools =
    import.meta.env.DEV ||
    (import.meta.env.VITE_INTERNAL_TOOLS === "1" && !__MBS_NATIVE_RELEASE__);

  useEffect(() => {
    if (import.meta.env.DEV && !FUNCTIONS_ORIGIN) {
      setMessage(
        "Functions origin is not configured (set VITE_FUNCTIONS_ORIGIN or VITE_FUNCTIONS_URL)."
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    if (firebaseApiKey) {
      params.set("clientKey", firebaseApiKey);
    }

    fetch(`/systemHealth${params.size ? `?${params.toString()}` : ""}`, {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        try {
          return (await response.json()) as HealthSnapshot;
        } catch {
          return null;
        }
      })
      .then((payload) => {
        if (!payload) return;
        if (payload.identityToolkitReachable === false) {
          setMessage(
            describeIdentityToolkitIssue(payload.identityToolkitReason)
          );
        }
      })
      .catch(() => {
        // ignore banner errors
      });

    return () => controller.abort();
  }, []);

  if (!message) return null;

  return (
    <div style={bar} role="status" aria-live="polite">
      <span>{message}</span>
      {allowInternalTools && (
        <span style={{ marginLeft: 8 }}>
          <a href="/diagnostics" style={link}>
            Diagnostics
          </a>
        </span>
      )}
    </div>
  );
}

function describeIdentityToolkitIssue(reason?: string): string {
  switch (reason) {
    case "no_client_key":
      return "Diagnostics missing client API key. Update environment settings.";
    case "timeout":
      return "Identity Toolkit check timed out.";
    case "network_error":
      return "Identity Toolkit check failed (network error).";
    default:
      if (reason?.startsWith("status_")) {
        return `Identity Toolkit returned status ${reason.replace("status_", "")}.`;
      }
      return "Identity Toolkit might be unreachable for this API key.";
  }
}

const bar: CSSProperties = {
  position: "sticky",
  top: 0,
  left: 0,
  right: 0,
  padding: "8px 12px",
  background: "#fff5f5",
  borderBottom: "1px solid #ffd6d6",
  color: "#7a1f1f",
  fontSize: 13,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
};

const link: CSSProperties = {
  color: "#7a1f1f",
  textDecoration: "underline",
};
