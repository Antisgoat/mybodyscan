import React from "react";
import { useClaims } from "@/lib/claims";

type Props = {
  className?: string;
};

export default function CreditsBadge(props: Props) {
  const { className } = props;
  const { user, claims, loading, refresh } = useClaims();

  const text = (() => {
    if (loading) return "—";
    if (!user) return "—";
    const dev = claims?.dev === true;
    if (dev) return "∞";
    const n =
      typeof claims?.credits === "number" && Number.isFinite(claims.credits)
        ? Math.max(0, Math.floor(claims.credits))
        : 0;
    return String(n);
  })();

  const title = (() => {
    if (!user) return "Not signed in";
    if (claims?.dev === true) return "Developer account";
    return "Available credits";
  })();

  return (
    <div style={containerStyle} className={className} title={title} aria-label={title}>
      <span style={pillStyle}>{text}</span>
      <button type="button" style={btnStyle} aria-label="Refresh credits" onClick={() => void refresh()}>
        Refresh
      </button>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const pillStyle: React.CSSProperties = {
  display: "inline-block",
  minWidth: 24,
  padding: "2px 8px",
  borderRadius: 999,
  border: "1px solid rgba(0,0,0,0.12)",
  fontSize: 12,
  lineHeight: "18px",
  textAlign: "center",
};

const btnStyle: React.CSSProperties = {
  appearance: "none",
  border: "1px solid rgba(0,0,0,0.12)",
  background: "transparent",
  borderRadius: 6,
  padding: "2px 6px",
  fontSize: 11,
  lineHeight: "16px",
  cursor: "pointer",
};
