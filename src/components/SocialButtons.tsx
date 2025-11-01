import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { CSSProperties } from "react";

import { isProviderEnabled, loadFirebaseAuthClientConfig } from "@/lib/firebaseAuthConfig";

type RenderContext = {
  loading: boolean;
};

type SocialButtonsProps = {
  loading: boolean;
  className?: string;
  style?: CSSProperties;
  renderGoogle: (context: RenderContext) => ReactNode;
  renderApple: (context: RenderContext) => ReactNode;
  onAvailabilityChange?: (available: boolean) => void;
};

export function SocialButtons({ loading, className, style, renderGoogle, renderApple, onAvailabilityChange }: SocialButtonsProps) {
  const envEnableApple = useMemo(() => {
    const raw = import.meta.env.VITE_ENABLE_APPLE as string | undefined;
    if (typeof raw !== "string") return false;
    const normalized = raw.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
  }, []);

  const [appleProviderEnabled, setAppleProviderEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    loadFirebaseAuthClientConfig()
      .then((config) => {
        if (!active) return;
        const enabled = isProviderEnabled("apple.com", config);
        setAppleProviderEnabled(enabled);
        if (typeof onAvailabilityChange === "function") {
          onAvailabilityChange(envEnableApple || enabled === true);
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.warn("[social-buttons] Unable to load Firebase provider config", error);
        }
        if (!active) return;
        setAppleProviderEnabled(false);
        if (typeof onAvailabilityChange === "function") {
          onAvailabilityChange(envEnableApple);
        }
      });
    return () => {
      active = false;
    };
  }, [envEnableApple, onAvailabilityChange]);

  const showApple = envEnableApple || appleProviderEnabled === true;

  useEffect(() => {
    if (!showApple) return;
    if (typeof document === "undefined") return;
    const existing = document.querySelector<HTMLScriptElement>("script[data-apple-auth]");
    if (existing) return;
    try {
      const script = document.createElement("script");
      script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
      script.async = true;
      script.dataset.appleAuth = "true";
      script.onerror = () => {
        if (import.meta.env.DEV) {
          console.warn("[social-buttons] Failed to load Apple JS SDK");
        }
      };
      document.head.appendChild(script);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn("[social-buttons] Unable to append Apple JS SDK", error);
      }
    }
  }, [showApple]);

  return (
    <div className={className} style={style}>
      {renderGoogle({ loading })}
      {showApple ? renderApple({ loading }) : null}
    </div>
  );
}

