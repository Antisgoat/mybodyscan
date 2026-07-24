import React, { useState } from "react";

const KEY = "mbs_policy_ok_v1";

function hasAcceptedPolicies(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return true; // fail-open to avoid locking out browsers without storage
  }
}

export default function PolicyGate(_props: { children?: React.ReactNode }) {
  const [accepted, setAccepted] = useState(hasAcceptedPolicies);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [acceptedDisclaimer, setAcceptedDisclaimer] = useState(false);

  function onAccept() {
    if (!acceptedTerms || !acceptedPrivacy || !acceptedDisclaimer) return;
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* empty */
    }
    setAccepted(true);
  }

  if (accepted) return null;

  return (
    <div
      style={wrap}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pg-title"
    >
      <div style={card}>
        <h2 id="pg-title" style={title}>
          Welcome to MyBodyScan
        </h2>
        <p style={subtle}>
          Before using our app, please review and accept our policies.
        </p>
        <ul style={list}>
          <li>
            <label>
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
              />{" "}
              I accept the{" "}
              <a href="/terms" target="_blank" rel="noreferrer">
                Terms of Service
              </a>
            </label>
          </li>
          <li>
            <label>
              <input
                type="checkbox"
                checked={acceptedPrivacy}
                onChange={(event) => setAcceptedPrivacy(event.target.checked)}
              />{" "}
              I accept the{" "}
              <a href="/privacy" target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
            </label>
          </li>
          <li>
            <label>
              <input
                type="checkbox"
                checked={acceptedDisclaimer}
                onChange={(event) =>
                  setAcceptedDisclaimer(event.target.checked)
                }
              />{" "}
              I understand the{" "}
              <a href="/legal/disclaimer" target="_blank" rel="noreferrer">
                Medical Disclaimer
              </a>
            </label>
          </li>
        </ul>
        <button
          type="button"
          onClick={onAccept}
          style={{
            ...btn,
            cursor:
              acceptedTerms && acceptedPrivacy && acceptedDisclaimer
                ? "pointer"
                : "not-allowed",
            opacity:
              acceptedTerms && acceptedPrivacy && acceptedDisclaimer ? 1 : 0.55,
          }}
          disabled={!acceptedTerms || !acceptedPrivacy || !acceptedDisclaimer}
        >
          I Accept
        </button>
      </div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "grid",
  placeItems: "center",
  zIndex: 10000,
};
const card: React.CSSProperties = {
  width: "92%",
  maxWidth: 540,
  background: "white",
  borderRadius: 12,
  border: "1px solid #eee",
  boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
  padding: 16,
  display: "grid",
  gap: 10,
};
const title: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 700 };
const subtle: React.CSSProperties = { fontSize: 13, color: "#555" };
const list: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  display: "grid",
  gap: 6,
  fontSize: 13,
};
const btn: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "white",
};
