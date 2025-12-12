import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { toast } from "@/lib/toast";
import {
  appleSignIn,
  describeAuthError,
  googleSignInWithFirebase,
  type NormalizedAuthError,
} from "@/lib/login";

export type SocialProvider = "google" | "apple";

export type SocialButtonRenderContext = {
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
};

export type SocialButtonsProps = {
  className?: string;
  style?: CSSProperties;
  loading?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onBeforeSignIn?: (provider: SocialProvider) => void;
  onSignInSuccess?: (provider: SocialProvider) => void;
  onSignInError?: (
    provider: SocialProvider,
    error: NormalizedAuthError
  ) => void;
  renderGoogle?: (context: SocialButtonRenderContext) => ReactNode;
  renderApple?: (context: SocialButtonRenderContext) => ReactNode;
};

export function SocialButtons({
  className,
  style,
  loading = false,
  onBusyChange,
  onBeforeSignIn,
  onSignInSuccess,
  onSignInError,
  renderGoogle,
  renderApple,
}: SocialButtonsProps) {
  const googleEnabled = useMemo(
    () => parseBoolean(import.meta.env.VITE_ENABLE_GOOGLE),
    []
  );
  const appleEnabled = useMemo(
    () => parseBoolean(import.meta.env.VITE_ENABLE_APPLE),
    []
  );

  const [activeProvider, setActiveProvider] = useState<SocialProvider | null>(
    null
  );

  useEffect(() => {
    onBusyChange?.(activeProvider !== null);
  }, [activeProvider, onBusyChange]);

  const handleResultError = useCallback(
    (provider: SocialProvider, error: NormalizedAuthError) => {
      if (onSignInError) {
        onSignInError(provider, error);
        return;
      }
      toast(error.message, "error");
    },
    [onSignInError]
  );

  const startSignIn = useCallback(
    async (provider: SocialProvider) => {
      if (loading || activeProvider) {
        return;
      }

      setActiveProvider(provider);
      onBeforeSignIn?.(provider);

      try {
        const result =
          provider === "google"
            ? await googleSignInWithFirebase()
            : await appleSignIn();
        if (!result.ok) {
          const fallbackMessage =
            provider === "google"
              ? "Google sign-in failed."
              : "Apple sign-in failed.";
          handleResultError(provider, {
            code: result.code,
            message: result.message ?? fallbackMessage,
          });
          return;
        }
        onSignInSuccess?.(provider);
      } catch (error: unknown) {
        const mapped = describeAuthError(error);
        handleResultError(provider, mapped);
      } finally {
        setActiveProvider(null);
      }
    },
    [
      activeProvider,
      handleResultError,
      loading,
      onBeforeSignIn,
      onSignInSuccess,
    ]
  );

  const isBusy = activeProvider !== null;
  const googleContext: SocialButtonRenderContext = useMemo(
    () => ({
      onClick: () => startSignIn("google"),
      loading: activeProvider === "google",
      disabled: loading || isBusy,
    }),
    [activeProvider, isBusy, loading, startSignIn]
  );

  const appleContext: SocialButtonRenderContext = useMemo(
    () => ({
      onClick: () => startSignIn("apple"),
      loading: activeProvider === "apple",
      disabled: loading || isBusy,
    }),
    [activeProvider, isBusy, loading, startSignIn]
  );

  return (
    <div className={className} style={style}>
      {googleEnabled &&
        (renderGoogle ? (
          renderGoogle(googleContext)
        ) : (
          <DefaultGoogleButton context={googleContext} />
        ))}
      {appleEnabled &&
        (renderApple ? (
          renderApple(appleContext)
        ) : (
          <DefaultAppleButton context={appleContext} />
        ))}
    </div>
  );
}

function DefaultGoogleButton({
  context,
}: {
  context: SocialButtonRenderContext;
}) {
  return (
    <button
      type="button"
      onClick={context.onClick}
      disabled={context.disabled}
      className="mbs-btn mbs-btn-secondary w-full"
    >
      {context.loading ? "Continuing…" : "Continue with Google"}
    </button>
  );
}

function DefaultAppleButton({
  context,
}: {
  context: SocialButtonRenderContext;
}) {
  return (
    <button
      type="button"
      onClick={context.onClick}
      disabled={context.disabled}
      className="mbs-btn mbs-btn-secondary w-full"
    >
      {context.loading ? "Continuing…" : "Continue with Apple"}
    </button>
  );
}

function parseBoolean(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return ["true", "1", "yes", "on"].includes(normalized);
}
