import React, { useEffect, useState } from "react";

export default function SetupBanner() {
  const [visible, setVisible] = useState(false);
  const [msg, setMsg] = useState<string>("");

  useEffect(() => {
    function onBoot(e: Event) {
      const d = (e as CustomEvent)?.detail as { apiKey?: boolean; itk?: number } | undefined;
      const apiKey = !!d?.apiKey;
      const itk = Number(d?.itk || 0);

      if (!apiKey) {
        setMsg("Firebase init.json has no apiKey. Check Hosting config.");
        setVisible(true);
      } else if (itk && itk !== 200) {
        setMsg(
          "Identity Toolkit not reachable for this key. Enable the API or relax key restrictions.",
        );
        setVisible(true);
      } else {
        setVisible(false);
      }
    }

    window.addEventListener("mbs:boot", onBoot as EventListener);
    return () => window.removeEventListener("mbs:boot", onBoot as EventListener);
  }, []);

  if (!visible) return null;

  return (
    <div style={bar} role="alert" aria-live="polite">
      <span>{msg}</span>
      <span style={{ marginLeft: 8 }}>
        <a href="/diagnostics" style={link}>
          Diagnostics
        </a>
      </span>
    </div>
  );
}

const bar: React.CSSProperties = {
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

const link: React.CSSProperties = {
  color: "#7a1f1f",
  textDecoration: "underline",
};
