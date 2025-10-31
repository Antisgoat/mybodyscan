import React, { useState } from "react";
import CreditsBadge from "./CreditsBadge";
import BillingButtons from "./BillingButtons";
import { useClaims } from "@/lib/claims";
import { isDemo, startDemo } from "@/lib/demo";
import HeaderEnvBadge from "@/components/HeaderEnvBadge";
import { toast } from "@/hooks/use-toast";
import { buildErrorToast } from "@/lib/errorToasts";

export type AppHeaderProps = {
  className?: string;
};

const wrap: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "10px 12px",
  borderBottom: "1px solid #eee",
  background: "white",
  position: "sticky",
  top: 0,
  zIndex: 100,
};

const left: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const right: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  justifyContent: "flex-end",
};

const brand: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "inherit",
  textDecoration: "none",
};

const demoPill: React.CSSProperties = {
  fontSize: 10,
  padding: "2px 6px",
  borderRadius: 999,
  border: "1px solid #ddd",
  background: "#fffbf0",
};

const signedInAs: React.CSSProperties = {
  fontSize: 12,
  color: "#555",
};

const loginLink: React.CSSProperties = {
  fontSize: 12,
  color: "#333",
  textDecoration: "underline",
};

const demoBtn: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "white",
  cursor: "pointer",
  fontSize: 12,
};

function formatUserLabel(email?: string | null): string {
  if (email && email.trim().length > 0) return email;
  return "Signed in";
}

const exploreError = "Demo sign-in failed. Please reload and try again.";

const demoSuccessMessage = "Demo mode enabled.";

function AppHeaderComponent({ className }: AppHeaderProps) {
  const { user } = useClaims();
  const demo = isDemo();
  const [pending, setPending] = useState(false);

  async function onExploreDemo() {
    if (pending) return;
    setPending(true);
    try {
      const result = await startDemo();
      if (!result.ok) {
        const message = "message" in result ? result.message : undefined;
        toast({
          title: "Demo sign-in failed",
          description: message ?? exploreError,
          variant: "destructive",
        });
        return;
      }
      if (typeof window !== "undefined") {
        // Optional: navigate after demo starts. Update to suit your router if desired.
        window.dispatchEvent(
          new CustomEvent("mbs:toast", { detail: { level: "info", message: demoSuccessMessage } })
        );
      }
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: { title: "Demo sign-in failed", description: exploreError, variant: "destructive" },
          includeCodeInDev: false,
        }),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <header className={className} style={wrap} role="banner">
      <div style={left}>
        <a href="/" style={brand} aria-label="MyBodyScan Home">
          MyBodyScan
        </a>
        <HeaderEnvBadge />
        {demo && (
          <span style={demoPill} aria-label="Demo mode active">
            DEMO
          </span>
        )}
      </div>

      <div style={right}>
        {user ? (
          <span style={signedInAs} title={formatUserLabel(user.email)}>
            {formatUserLabel(user.email)}
          </span>
        ) : (
          <a href="/login" style={loginLink} aria-label="Go to login">
            Sign in
          </a>
        )}

        <CreditsBadge />
        <BillingButtons />

        {!user && (
          <button
            type="button"
            onClick={onExploreDemo}
            style={{ ...demoBtn, opacity: pending ? 0.7 : 1, pointerEvents: pending ? "none" : "auto" }}
            aria-label="Explore Demo"
            disabled={pending}
          >
            {pending ? "Loading…" : "Explore Demo"}
          </button>
        )}
      </div>
    </header>
  );
}

export default AppHeaderComponent;
export { AppHeaderComponent as AppHeader };
