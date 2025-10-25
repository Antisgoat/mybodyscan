import React, { useState } from "react";

export default function SkipLink() {
  const [focused, setFocused] = useState(false);

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    left: "-9999px",
    top: 0,
    zIndex: 10001,
    background: "white",
    border: "1px solid #ddd",
    borderRadius: 8,
    padding: "8px 10px",
    color: "inherit",
  };

  const focusStyle: React.CSSProperties = {
    left: 12,
    top: 12,
  };

  return (
    <a
      href="#main-content"
      style={focused ? { ...baseStyle, ...focusStyle } : baseStyle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      Skip to content
    </a>
  );
}
