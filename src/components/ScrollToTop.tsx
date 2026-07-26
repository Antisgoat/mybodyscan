import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [hash, pathname]);

  return null;
}
