import React, { useEffect } from "react";
import { useLocation } from "react-router-dom";

function PreviewHealthCheckInner() {
  const location = useLocation();
  useEffect(() => {
    console.log("[preview] ok", location.pathname);
  }, [location]);
  return null;
}

export function runPreviewChecks() {
  return <PreviewHealthCheckInner />;
}
