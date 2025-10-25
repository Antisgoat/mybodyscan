import React, { useEffect, useState } from "react";

const KEY = "mbs_policy_ok_v1";

export default function PolicyGate(_props: { children?: React.ReactNode }) {
  const [accepted, setAccepted] = useState<boolean>(true);

  useEffect(() => {
    try {
      const ok = localStorage.getItem(KEY) === "1";
      setAccepted(ok);
    } catch {
      setAccepted(true); // fail-open to avoid lockout
    }
  }, []);

  function onAccept() {
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
    // IMPORTANT: do not navigate to another route; just reload in place
    try {
      location.reload();
    } catch {}
  }

  if (accepted) return null;

  return (
    <div style={wrap} role="dialog" aria-modal="true" aria-labelledby="pg-title">
      <div style={card}>
        <h2 id="pg-title" style={title}>
          Welcome to MyBodyScan
        </h2>
        <p style={subtle}>Before using our app, please review and accept our policies.</p>
        <ul style={list}>
          <li>
            <label>
              <input type="checkbox" defaultChecked readOnly /> I accept the {" "}
              <a href="/terms" target="_blank" rel="noreferrer">
                Terms of Service
              </a>
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" defaultChecked readOnly /> I accept the {" "}
              <a href="/privacy" target="_blank" rel="noreferrer">
                Privacy Policy
              </a>
            </label>
          </li>
          <li>
            <label>
              <input type="checkbox" defaultChecked readOnly /> I understand the {" "}
              <a href="/medical" target="_blank" rel="noreferrer">
                Medical Disclaimer
              </a>
            </label>
          </li>
        </ul>
        <button type="button" onClick={onAccept} style={btn}>
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
const list: React.CSSProperties = { margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 13 };
const btn: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  borderRadius: 8,
  background: "white",
  cursor: "pointer",
};
