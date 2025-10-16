import { useEffect, useState } from "react";
import { loadFirebaseAuthClientConfig } from "@/lib/firebaseAuthConfig";

function domainMatches(host: string, domain: string): boolean {
  const h = host.toLowerCase();
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  if (h === d) return true;
  return h.endsWith(`.${d}`);
}

export function DevAuthDomainBanner() {
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (typeof window === "undefined") return;
    let active = true;
    loadFirebaseAuthClientConfig()
      .then((config) => {
        if (!active) return;
        if (!config.authorizedDomains.length) return;
        const host = window.location.hostname;
        const isAuthorized = config.authorizedDomains.some((d) => domainMatches(host, d));
        if (!isAuthorized) setUnauthorized(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (!import.meta.env.DEV || !unauthorized) return null;
  return (
    <div className="w-full bg-amber-50 text-amber-900 text-xs px-3 py-2 border-b border-amber-200" role="note">
      This domain is not authorized for Firebase Auth. Add it in Firebase Console → Auth → Settings → Authorized domains.
    </div>
  );
}

export default DevAuthDomainBanner;
