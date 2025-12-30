import React, { useEffect, useState } from "react";
import CreditBadge from "./CreditBadge";
import BillingButtons from "./BillingButtons";
import { useNavigate } from "react-router-dom";
import { useClaims } from "@/lib/claims";
import { useCredits } from "@/hooks/useCredits";
import { useDemoMode } from "@/components/DemoModeProvider";
import { disableDemoEverywhere, enableDemo } from "@/state/demo";
import HeaderEnvBadge from "@/components/HeaderEnvBadge";
import { toast } from "@/hooks/use-toast";
import { buildErrorToast } from "@/lib/errorToasts";
import { ensureAppCheck, getAppCheckHeader, hasAppCheck } from "@/lib/appCheck";
import { useSubscription } from "@/hooks/useSubscription";
import { useEntitlements } from "@/lib/entitlements/store";
import { hasPro } from "@/lib/entitlements/pro";
import {
  coachChatCollectionPath,
  coachThreadMessagesCollectionPath,
  coachThreadsCollectionPath,
} from "@/lib/paths";
import { getLastPermissionDenied } from "@/lib/devDiagnostics";

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
  border: "1px solid #facc15",
  background: "#fef3c7",
  color: "#92400e",
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

const devToolsButtonStyle: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #d0d7e2",
  borderRadius: 8,
  background: "#f8fafc",
  cursor: "pointer",
  fontSize: 12,
  color: "#1f2937",
};

const drawerStyle: React.CSSProperties = {
  position: "fixed",
  top: 72,
  right: 16,
  width: 320,
  maxHeight: "80vh",
  overflowY: "auto",
  padding: 16,
  borderRadius: 12,
  border: "1px solid rgba(15,23,42,0.08)",
  background: "#fff",
  boxShadow: "0 18px 45px rgba(15,23,42,0.18)",
  zIndex: 400,
};

const drawerHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: 12,
};

const drawerTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#111827",
};

const drawerCloseButtonStyle: React.CSSProperties = {
  border: "1px solid #d0d7e2",
  background: "transparent",
  borderRadius: 6,
  padding: "2px 6px",
  fontSize: 11,
  cursor: "pointer",
};

const drawerSectionStyle: React.CSSProperties = {
  marginBottom: 16,
  display: "grid",
  gap: 6,
};

const drawerSectionHeaderStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "#1f2937",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const drawerBodyTextStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#374151",
};

const drawerPreStyle: React.CSSProperties = {
  fontSize: 11,
  background: "#f8fafc",
  border: "1px solid #d0d7e2",
  borderRadius: 8,
  padding: 8,
  margin: 0,
  maxHeight: 160,
  overflow: "auto",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};

const drawerActionStyle: React.CSSProperties = {
  border: "1px solid #d0d7e2",
  background: "#f1f5f9",
  borderRadius: 6,
  padding: "4px 8px",
  fontSize: 11,
  cursor: "pointer",
  width: "fit-content",
};

const drawerLinkStyle: React.CSSProperties = {
  fontSize: 12,
  color: "#2563eb",
  textDecoration: "none",
  display: "block",
};

function formatUserLabel(email?: string | null): string {
  if (email && email.trim().length > 0) return email;
  return "Signed in";
}

const exploreError = "Demo preview failed. Please try again.";

type DevAppCheckInfo = {
  status: "idle" | "loading" | "available" | "unavailable" | "error";
  suffix?: string;
  error?: string;
};

function AppHeaderComponent({ className }: AppHeaderProps) {
  const { user, claims, refresh } = useClaims();
  const { credits, unlimited: creditsUnlimited } = useCredits();
  const { subscription } = useSubscription();
  const { entitlements } = useEntitlements();
  const demo = useDemoMode();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [devToolsOpen, setDevToolsOpen] = useState(false);
  const [appCheckInfo, setAppCheckInfo] = useState<DevAppCheckInfo>({
    status: "idle",
  });
  const showDevTools = import.meta.env.DEV || claims?.dev === true;

  useEffect(() => {
    if (!showDevTools && devToolsOpen) {
      setDevToolsOpen(false);
    }
  }, [showDevTools, devToolsOpen]);

  useEffect(() => {
    if (!devToolsOpen) {
      return;
    }
    if (!hasAppCheck()) {
      setAppCheckInfo({ status: "unavailable", error: "App Check disabled" });
      return;
    }
    let cancelled = false;
    void (async () => {
      setAppCheckInfo({ status: "loading" });
      try {
        await ensureAppCheck();
        const header = await getAppCheckHeader(true);
        const token = header["X-Firebase-AppCheck"];
        if (!cancelled) {
          if (typeof token === "string" && token) {
            setAppCheckInfo({ status: "available", suffix: token.slice(-8) });
          } else {
            setAppCheckInfo({
              status: "unavailable",
              error: "No token issued",
            });
          }
        }
      } catch (error) {
        if (!cancelled) {
          setAppCheckInfo({
            status: "error",
            error: (error as { message?: string })?.message ?? String(error),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [devToolsOpen]);

  async function onExploreDemo() {
    if (pending) return;
    setPending(true);
    try {
      enableDemo();
      navigate("/demo", { replace: true });
    } catch (error) {
      toast(
        buildErrorToast(error, {
          fallback: {
            title: "Demo preview unavailable",
            description: exploreError,
            variant: "destructive",
          },
          includeCodeInDev: false,
        })
      );
    } finally {
      setPending(false);
    }
  }

  const creditsDisplay = creditsUnlimited
    ? "∞ (unlimited)"
    : Number.isFinite(credits)
      ? `${Math.max(0, Math.floor(Number(credits)))} available`
      : "—";
  const claimsJson = JSON.stringify(claims ?? {}, null, 2);
  const uid = user?.uid ?? null;
  const entitlementTier = (() => {
    if (!user) return "signed-out";
    if (demo) return "demo";
    if (hasPro(entitlements)) return "pro";
    return "free";
  })();
  const coachPaths = uid
    ? {
        coachThreads: coachThreadsCollectionPath(uid),
        coachMessagesExample: coachThreadMessagesCollectionPath(uid, "THREAD_ID"),
        coachLegacyChat: coachChatCollectionPath(uid),
      }
    : null;
  const lastDenied = getLastPermissionDenied();
  const appCheckLabel = (() => {
    switch (appCheckInfo.status) {
      case "loading":
        return "Loading token…";
      case "available":
        return appCheckInfo.suffix
          ? `Token available (…${appCheckInfo.suffix})`
          : "Token available";
      case "unavailable":
        return appCheckInfo.error ?? "Not available";
      case "error":
        return `Error: ${appCheckInfo.error ?? "unknown"}`;
      default:
        return "Idle";
    }
  })();

  return (
    <>
      <header className={className} style={wrap} role="banner">
        <div style={left}>
          <a href="/" style={brand} aria-label="MyBodyScan Home">
            MyBodyScan
          </a>
          <HeaderEnvBadge />
          {demo && (
            <span style={demoPill} aria-label="Demo mode active">
              Demo
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

          <CreditBadge />
          <BillingButtons />

          {showDevTools && (
            <button
              type="button"
              style={devToolsButtonStyle}
              onClick={() => setDevToolsOpen((prev) => !prev)}
              aria-expanded={devToolsOpen}
              aria-controls="dev-tools-drawer"
            >
              {devToolsOpen ? "Close Dev Tools" : "Dev Tools"}
            </button>
          )}

          {!user && !demo && (
            <button
              type="button"
              onClick={onExploreDemo}
              style={{
                ...demoBtn,
                opacity: pending ? 0.7 : 1,
                pointerEvents: pending ? "none" : "auto",
              }}
              aria-label="Explore Demo"
              disabled={pending}
            >
              {pending ? "Loading…" : "Explore Demo"}
            </button>
          )}

          {demo && (
            <button
              type="button"
              onClick={() => {
                disableDemoEverywhere();
                navigate("/auth", { replace: true });
              }}
              style={demoBtn}
              aria-label="Leave demo"
            >
              Leave demo
            </button>
          )}
        </div>
      </header>

      {showDevTools && devToolsOpen && (
        <div
          id="dev-tools-drawer"
          style={drawerStyle}
          role="dialog"
          aria-label="Dev Tools"
        >
          <div style={drawerHeaderStyle}>
            <strong style={drawerTitleStyle}>Dev Tools</strong>
            <button
              type="button"
              style={drawerCloseButtonStyle}
              onClick={() => setDevToolsOpen(false)}
            >
              Close
            </button>
          </div>

          <div style={drawerSectionStyle}>
            <div style={drawerSectionHeaderStyle}>Claims</div>
            <pre style={drawerPreStyle}>{claimsJson}</pre>
            <button
              type="button"
              style={drawerActionStyle}
              onClick={() => void refresh(true)}
            >
              Refresh claims
            </button>
          </div>

          <div style={drawerSectionStyle}>
            <div style={drawerSectionHeaderStyle}>System check</div>
            <div style={drawerBodyTextStyle}>uid: {uid ?? "—"}</div>
            <div style={drawerBodyTextStyle}>entitlement: {entitlementTier}</div>
            <div style={drawerBodyTextStyle}>
              coach paths:
              <pre style={drawerPreStyle}>
                {JSON.stringify(coachPaths ?? {}, null, 2)}
              </pre>
            </div>
            <div style={drawerBodyTextStyle}>
              last permission-denied:
              <pre style={drawerPreStyle}>
                {JSON.stringify(lastDenied ?? {}, null, 2)}
              </pre>
            </div>
          </div>

          <div style={drawerSectionStyle}>
            <div style={drawerSectionHeaderStyle}>Credits</div>
            <div style={drawerBodyTextStyle}>{creditsDisplay}</div>
          </div>

          <div style={drawerSectionStyle}>
            <div style={drawerSectionHeaderStyle}>App Check</div>
            <div style={drawerBodyTextStyle}>{appCheckLabel}</div>
          </div>

          <div style={drawerSectionStyle}>
            <div style={drawerSectionHeaderStyle}>UAT</div>
            <a href="/__uat#seed-unlimited" style={drawerLinkStyle}>
              Seed ∞ credits
            </a>
            <a href="/__uat#checkout-starter" style={drawerLinkStyle}>
              Stripe Checkout (Starter)
            </a>
            <a href="/__uat#portal" style={drawerLinkStyle}>
              Customer Portal
            </a>
          </div>
        </div>
      )}
    </>
  );
}

export default AppHeaderComponent;
export { AppHeaderComponent as AppHeader };
