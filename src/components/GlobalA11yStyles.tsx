import React from "react";

export default function GlobalA11yStyles() {
  return (
    <style>{`
      :focus-visible {
        outline: 2px solid #7aa7ff;
        outline-offset: 2px;
      }

      [role="alert"] {
        /* Alerts rely on context styling; adjust globally if needed. */
      }
    `}</style>
  );
}
