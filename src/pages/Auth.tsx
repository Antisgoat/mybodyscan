import {
  Suspense,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Seo } from "@/components/Seo";
import { toast as notify } from "@/hooks/use-toast";
import {
  createAccountEmail,
  sendReset,
  startAuthListener,
  useAuthUser,
} from "@/auth/mbs-auth";
import {
  signInApple as startAppleSignIn,
  signInEmailPassword,
  signInGoogle as startGoogleSignIn,
} from "@/auth/mbs-auth";
import {
  firebaseConfigMissingKeys,
  firebaseConfigWarningKeys,
  getFirebaseInitError,
  getFirebaseConfig,
  hasFirebaseConfig,
} from "@/lib/firebase";
import { isNativeCapacitor } from "@/lib/platform";
import { warnIfDomainUnauthorized } from "@/lib/firebaseAuthConfig";
import {
  getIdentityToolkitProbeStatus,
  probeFirebaseRuntime,
  type IdentityToolkitProbeStatus,
} from "@/lib/firebase/runtimeConfig";
import { toast } from "@/lib/toast";
import { disableDemoEverywhere } from "@/lib/demoState";
import { enableDemo } from "@/state/demo";
import type { FirebaseError } from "firebase/app";
import { reportError } from "@/lib/telemetry";
import { checkOnline } from "@/lib/network";
import { getInitAuthState } from "@/lib/auth/initAuth";

const ENABLE_GOOGLE = (import.meta as any).env?.VITE_ENABLE_GOOGLE !== "false";
const ENABLE_APPLE = (import.meta as any).env?.VITE_ENABLE_APPLE !== "false";
const LOGIN_TIMEOUT_MS = 15_000;
const DEBUG_TAP_COUNT = 7;
const DEBUG_TAP_WINDOW_MS = 2_000;

const LazyAuthDebugPanel = lazy(() =>
  import("@/components/auth/AuthDebugPanel").then((mod) => ({
    default: mod.AuthDebugPanel,
  }))
);

const AppleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 14 17" width="16" height="16" aria-hidden="true" {...props}>
    <path
      d="M10.24 9.1c.01 2.16 1.86 2.88 1.88 2.89-.01.04-.3 1.03-1 2.03-.6.86-1.23 1.72-2.22 1.74-.97.02-1.28-.56-2.38-.56-1.1 0-1.44.54-2.35.58-.94.04-1.66-.93-2.27-1.79C.68 12.5-.2 10 0 7.66c.13-1.26.73-2.43 1.7-3.11.75-.51 1.67-.73 2.56-.6.6.12 1.1.36 1.48.56.38.2.68.37.88.36.18 0 .5-.18.88-.37.53-.28 1.13-.6 1.93-.6.01 0 .01 0 .02 0 .72.01 2.26.18 3.33 1.77-.09.06-1.98 1.15-1.93 3.43ZM7.3 1.62C7.9.88 8.97.33 9.88.32c.1.98-.29 1.96-.87 2.64C8.4 3.7 7.39 4.28 6.37 4.2c-.1-.96.4-1.98.93-2.58Z"
      fill="currentColor"
    />
  </svg>
);

const Auth = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const native = isNativeCapacitor();
  const from = (location.state as any)?.from || "/home";
  const searchParams = useMemo(
    () => new URLSearchParams(location.search),
    [location.search]
  );
  const nextParam = searchParams.get("next");
  const explicitDebug =
    (import.meta as any)?.env?.VITE_SHOW_DEBUG === "true";
  const isProdBuild = import.meta.env.PROD;
  const allowDebugUi =
    (import.meta.env.DEV || explicitDebug) &&
    !isProdBuild &&
    !__MBS_NATIVE_RELEASE__;
  const defaultTarget = nextParam || from || "/home";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [lastOAuthProvider, setLastOAuthProvider] =
    useState<("google.com" | "apple.com") | null>(null);
  const [configDetailsOpen, setConfigDetailsOpen] = useState(false);
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [selfTestStatus, setSelfTestStatus] = useState<{
    state: "idle" | "running" | "ok" | "error";
    message?: string;
  }>({ state: "idle" });
  const [identityProbe, setIdentityProbe] =
    useState<IdentityToolkitProbeStatus | null>(() =>
      getIdentityToolkitProbeStatus()
    );
  const mountedRef = useRef(true);
  const { user } = useAuthUser();
  const demoEnv = String(
    import.meta.env.VITE_DEMO_ENABLED ?? "true"
  ).toLowerCase();
  const demoEnabled =
    demoEnv !== "false" && import.meta.env.VITE_ENABLE_DEMO !== "false";
  const firebaseInitError = useMemo(() => getFirebaseInitError(), []);
  const onBrowseDemo = useCallback(() => {
    enableDemo();
    navigate("/demo", { replace: false });
  }, [navigate]);
  const canonical =
    typeof window !== "undefined" ? window.location.href : undefined;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!allowDebugUi) {
      setDebugEnabled(false);
      return;
    }
    try {
      setDebugEnabled(window.localStorage.getItem("mbs_debug") === "1");
    } catch {
      setDebugEnabled(false);
    }
  }, [allowDebugUi]);

  const setAuthErrorSafe = useCallback((value: string | null) => {
    if (mountedRef.current) {
      setAuthError(value);
    }
  }, []);

  const setLoadingSafe = useCallback((value: boolean) => {
    if (mountedRef.current) {
      setLoading(value);
    }
  }, []);

  const setLastOAuthProviderSafe = useCallback(
    (value: ("google.com" | "apple.com") | null) => {
      if (mountedRef.current) {
        setLastOAuthProvider(value);
      }
    },
    []
  );

  useEffect(() => {
    if (!user) return;
    disableDemoEverywhere();
    if (location.pathname !== defaultTarget) {
      navigate(defaultTarget, { replace: true });
    }
  }, [user, location.pathname, defaultTarget, navigate]);

  useEffect(() => {
    if (user) {
      if (!native) {
        void import("@/lib/auth/oauth").then(({ clearPendingOAuth }) => {
          clearPendingOAuth();
        });
      }
      return;
    }
    if (native) return;
    let cancelled = false;
    void import("@/lib/auth/oauth").then(({ peekPendingOAuth, clearPendingOAuth }) => {
      if (cancelled) return;
      const pending = peekPendingOAuth();
      if (!pending) return;
      setLastOAuthProviderSafe(pending.providerId);
      const elapsed = Date.now() - pending.startedAt;
      const remaining = Math.max(0, 15_000 - elapsed);
      if (remaining === 0) {
        clearPendingOAuth();
        const message = "Sign-in timed out. Check your connection and try again.";
        setAuthErrorSafe(message);
        toast(message, "error");
        return;
      }
      setLoadingSafe(true);
      const timer = window.setTimeout(() => {
        clearPendingOAuth();
        setLoadingSafe(false);
        const message = "Sign-in timed out. Check your connection and try again.";
        setAuthErrorSafe(message);
        toast(message, "error");
      }, remaining);
      return () => window.clearTimeout(timer);
    });
    return () => {
      cancelled = true;
    };
  }, [native, user]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (native) return;
      const { consumeAuthRedirectError } = await import("@/lib/authRedirect");
      const redirectError = await consumeAuthRedirectError();
      if (cancelled || !redirectError) {
        return;
      }
      const fallbackMessage =
        redirectError.friendlyMessage ??
        redirectError.message ??
        "Sign-in failed.";
      const friendlyCode = redirectError.friendlyCode ?? redirectError.code;
      const message = formatError(fallbackMessage, friendlyCode);
      setAuthErrorSafe(message);
      toast(message, "error");
    })();
    return () => {
      cancelled = true;
    };
  }, [native, toast]);

  useEffect(() => {
    warnIfDomainUnauthorized();
  }, []);

  useEffect(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "(unknown)";
    const config = getFirebaseConfig() as Record<string, unknown>;
    void reportError({
      kind: "auth_origin_check",
      message: "auth_origin_check",
      extra: {
        origin,
        authDomain: (config.authDomain as string) || null,
        projectId: (config.projectId as string) || null,
      },
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void probeFirebaseRuntime().then((result) => {
      if (cancelled) return;
      setIdentityProbe(result.identityToolkit);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const logAuthDebug = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      if (!import.meta.env.DEV) return;
      // eslint-disable-next-line no-console
      console.info(`[Auth] ${event}`, payload ?? {});
    },
    []
  );

  const attemptEmailAuth = useCallback(async () => {
    // IMPORTANT: Firebase config warnings should never block sign-in attempts.
    // If Auth is misconfigured, the sign-in call will fail and we show a friendly error.
    setAuthErrorSafe(null);
    const onlineStatus = await checkOnline();
    logAuthDebug("online_check", { status: onlineStatus, native });
    if (onlineStatus === "offline") {
      const message = "No internet connection. Please reconnect and try again.";
      setAuthErrorSafe(message);
      toast(message, "error");
      return;
    }
    setLoadingSafe(true);
    const startedAt = Date.now();
    logAuthDebug("email_auth_start", {
      mode,
      native,
      onlineStatus,
    });
    try {
      if (mode === "signin") {
        try {
          if (native) {
            // Lazy, user-action-only: start the native auth listener when the user
            // explicitly attempts to sign in (never at boot).
            await startAuthListener().catch(() => undefined);
          }
          await withTimeout(
            signInEmailPassword(email, password),
            LOGIN_TIMEOUT_MS
          );
          logAuthDebug("email_auth_success", {
            elapsedMs: Date.now() - startedAt,
          });
          return;
        } catch (err: unknown) {
          const error = err as FirebaseError & {
            code?: string;
            message?: string;
          };
          const code = error?.code ?? "unknown";
          const rawMessage = error?.message ?? "";

          if (typeof window !== "undefined") {
            console.error("[Auth] Email sign-in failed", {
              code,
              message: rawMessage,
              origin: window.location.origin,
            });
          }
          logAuthDebug("email_auth_failed", {
            code,
            message: rawMessage,
            elapsedMs: Date.now() - startedAt,
          });

          let uiMessage = "Sign-in failed. Please try again.";

          switch (code) {
            case "auth/network-request-failed":
              uiMessage = "Network error. Check your connection and try again.";
              break;
            case "auth/invalid-email":
              uiMessage = "That email address looks invalid.";
              break;
            case "auth/user-not-found":
            case "auth/wrong-password":
            case "auth/invalid-credential":
              uiMessage = "Email or password is incorrect.";
              break;
            case "auth/too-many-requests":
              uiMessage = "Too many attempts. Please wait a bit and try again.";
              break;
            case "auth/timeout":
              uiMessage =
                "Sign-in timed out. Check your connection and try again.";
              break;
            case "auth/operation-not-allowed":
              uiMessage =
                "Sign-in is not enabled for this project. Contact support.";
              break;
            case "auth/invalid-api-key":
              uiMessage =
                "Authentication configuration is invalid. Please contact support.";
              break;
            default:
              console.error("[Auth] Unhandled sign-in error", error);
              break;
          }

          const emailLower = email.trim().toLowerCase();
          const isAdminDev = emailLower === "developer@adlrlabs.com";
          const debugSuffix = isAdminDev ? ` [debug: ${code}]` : "";

          setAuthErrorSafe(`${uiMessage}${debugSuffix}`);
          return;
        }
      } else {
        if (native) {
          await startAuthListener().catch(() => undefined);
        }
        await withTimeout(createAccountEmail(email, password), LOGIN_TIMEOUT_MS);
        logAuthDebug("email_auth_success", {
          mode,
          elapsedMs: Date.now() - startedAt,
        });
      }
    } catch (err: unknown) {
      const normalized = normalizeFirebaseError(err);
      const fallback =
        mode === "signin"
          ? "Email sign-in failed."
          : "Account creation failed.";
      const timeoutMessage =
        mode === "signin"
          ? "Sign-in timed out. Check your connection and try again."
          : "Sign-up timed out. Check your connection and try again.";
      const message =
        normalized.code === "auth/timeout"
          ? timeoutMessage
          : formatError(normalized.message ?? fallback, normalized.code);
      logAuthDebug("email_auth_exception", {
        code: normalized.code,
        message: normalized.message,
      });
      setAuthErrorSafe(message);
      toast(message, "error");
    } finally {
      logAuthDebug("email_auth_done", {
        elapsedMs: Date.now() - startedAt,
      });
      setLoadingSafe(false);
    }
  }, [
    checkOnline,
    createAccountEmail,
    email,
    mode,
    native,
    password,
    logAuthDebug,
    setAuthErrorSafe,
    setLoadingSafe,
    signInEmailPassword,
    startAuthListener,
    toast,
  ]);

  const onSubmit = async (e: React.FormEvent) => {
    // Regression prevention: avoid form submit + window.location reloads in WebView.
    e.preventDefault();
    await attemptEmailAuth();
  };

  const handleGoogleSignIn = useCallback(async () => {
    if (native) {
      setAuthErrorSafe(
        "Google sign-in is available on web. On iOS, please use email/password for now."
      );
      return;
    }
    setAuthErrorSafe(null);
    setLoadingSafe(true);
    setLastOAuthProviderSafe("google.com");
    try {
      await withTimeout(startGoogleSignIn(defaultTarget), LOGIN_TIMEOUT_MS);
    } catch (error: unknown) {
      const { describeOAuthError } = await import("@/lib/auth/oauth");
      const mapped = describeOAuthError(error);
      const message = formatError(mapped.userMessage, mapped.code);
      console.error("[Auth] Google sign-in failed", {
        code: mapped.code,
        message: mapped.message,
      });
      void reportError({
        kind: "auth_oauth_failed",
        message: mapped.message || "Google sign-in failed",
        code: mapped.code,
        extra: {
          provider: "google.com",
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      setAuthErrorSafe(message);
      toast(message, "error");
    } finally {
      setLoadingSafe(false);
    }
  }, [
    defaultTarget,
    native,
    setAuthErrorSafe,
    setLastOAuthProviderSafe,
    setLoadingSafe,
  ]);

  const handleAppleSignIn = useCallback(async () => {
    if (native) {
      setAuthErrorSafe(
        "Apple sign-in is available on web. On iOS, please use email/password for now."
      );
      return;
    }
    setAuthErrorSafe(null);
    setLoadingSafe(true);
    setLastOAuthProviderSafe("apple.com");
    try {
      await withTimeout(startAppleSignIn(defaultTarget), LOGIN_TIMEOUT_MS);
    } catch (error: unknown) {
      const { describeOAuthError } = await import("@/lib/auth/oauth");
      const mapped = describeOAuthError(error);
      const message = formatError(mapped.userMessage, mapped.code);
      console.error("[Auth] Apple sign-in failed", {
        code: mapped.code,
        message: mapped.message,
      });
      void reportError({
        kind: "auth_oauth_failed",
        message: mapped.message || "Apple sign-in failed",
        code: mapped.code,
        extra: {
          provider: "apple.com",
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      setAuthErrorSafe(message);
      toast(message, "error");
    } finally {
      setLoadingSafe(false);
    }
  }, [
    defaultTarget,
    native,
    setAuthErrorSafe,
    setLastOAuthProviderSafe,
    setLoadingSafe,
  ]);

  const origin =
    typeof window !== "undefined" ? window.location.origin : "(unknown)";
  const config = getFirebaseConfig() as Record<string, unknown>;
  const isDev = import.meta.env.DEV;
  const showDebugPanel = allowDebugUi && (isDev || explicitDebug || debugEnabled);
  const tapStateRef = useRef({ count: 0, lastTap: 0 });
  const handleDebugTap = useCallback(() => {
    if (!allowDebugUi) return;
    if (typeof window === "undefined") return;
    const now = Date.now();
    const state = tapStateRef.current;
    if (now - state.lastTap > DEBUG_TAP_WINDOW_MS) {
      state.count = 0;
    }
    state.count += 1;
    state.lastTap = now;
    if (state.count >= DEBUG_TAP_COUNT) {
      state.count = 0;
      const next = !debugEnabled;
      setDebugEnabled(next);
      try {
        window.localStorage.setItem("mbs_debug", next ? "1" : "0");
      } catch {
        // ignore
      }
      toast(
        next ? "Developer debug enabled." : "Developer debug disabled.",
        "info"
      );
    }
  }, [allowDebugUi, debugEnabled]);
  const configStatus = useMemo(() => {
    if (firebaseInitError) {
      return { tone: "error" as const, message: firebaseInitError };
    }

    if (identityProbe && identityProbe.status !== "ok") {
      return {
        tone: "warning" as const,
        message:
          identityProbe.message ||
          (identityProbe.status === "error"
            ? "IdentityToolkit clientConfig probe failed."
            : "IdentityToolkit clientConfig returned a warning (often a missing authorized domain)."),
      };
    }

    if (firebaseConfigWarningKeys.length) {
      return {
        tone: "warning" as const,
        message: `Optional Firebase keys missing: ${firebaseConfigWarningKeys.join(", ")}`,
      };
    }

    return { tone: "ok" as const, message: "Firebase configuration detected." };
  }, [firebaseConfigWarningKeys, firebaseInitError, identityProbe]);
  const initAuthState = getInitAuthState();
  const runNetworkSelfTest = useCallback(async () => {
    setSelfTestStatus({ state: "running" });
    try {
      const response = await withTimeout(
        fetch("https://identitytoolkit.googleapis.com", {
          method: "GET",
          cache: "no-store",
        }),
        LOGIN_TIMEOUT_MS
      );
      setSelfTestStatus({
        state: "ok",
        message: `status ${response.status}`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Network request failed.";
      setSelfTestStatus({ state: "error", message });
    }
  }, []);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Seo
        title="Sign In · MyBodyScan"
        description="Access your MyBodyScan account to start and review scans."
        canonical={canonical}
      />
      <Card className="w-full max-w-md shadow-md">
        <CardHeader>
          <div className="text-center">
            <CardTitle className="text-2xl mb-2" onClick={handleDebugTap}>
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </CardTitle>
            <CardDescription className="text-slate-600">
              Track body fat, weight and progress — private and secure.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {showDebugPanel && (
            <Suspense fallback={null}>
              <LazyAuthDebugPanel
                origin={origin}
                config={config}
                hasFirebaseConfig={hasFirebaseConfig}
                firebaseConfigMissingKeys={firebaseConfigMissingKeys}
                firebaseConfigWarningKeys={firebaseConfigWarningKeys}
                firebaseInitError={firebaseInitError}
                identityProbe={identityProbe}
                authError={authError}
                initAuthState={initAuthState}
                userEmail={user?.email}
                userUid={user?.uid}
                configStatus={configStatus}
                configDetailsOpen={configDetailsOpen}
                onToggleConfigDetails={() =>
                  setConfigDetailsOpen((open) => !open)
                }
                onRunNetworkSelfTest={runNetworkSelfTest}
                selfTestStatus={selfTestStatus}
              />
            </Suspense>
          )}
          {allowDebugUi && firebaseInitError && (
            <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-900">
              <AlertTitle>Configuration warning</AlertTitle>
              <AlertDescription>{firebaseInitError}</AlertDescription>
            </Alert>
          )}
          {authError && (
            <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {authError}
            </div>
          )}
          {authError && mode === "signin" && !lastOAuthProvider ? (
            <div className="mb-4">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={() => void attemptEmailAuth()}
              >
                Retry sign in
              </Button>
              <p className="mt-2 text-xs text-muted-foreground text-center">
                If this keeps failing, check your connection and try again.
              </p>
            </div>
          ) : null}
          <div className="flex justify-center gap-2 mb-4">
            <Button
              size="sm"
              variant={mode === "signin" ? "default" : "outline"}
              onClick={() => setMode("signin")}
            >
              Sign in
            </Button>
            <Button
              size="sm"
              variant={mode === "signup" ? "default" : "outline"}
              onClick={() => setMode("signup")}
            >
              Create account
            </Button>
          </div>

          <div className="mb-4 p-4 bg-slate-50 rounded-lg">
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Accurate body-fat estimates from photos</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Progress tracking & reminders</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Private by default — your data, your control</span>
              </div>
            </div>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="submit"
                className="mbs-btn mbs-btn-primary w-full"
                disabled={loading}
              >
                {loading
                  ? mode === "signin"
                    ? "Signing in..."
                    : "Creating..."
                  : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
              </Button>
              <Button
                type="button"
                variant="link"
                disabled={loading}
                onClick={async () => {
                  try {
                    await sendReset(email);
                    notify({
                      title: "Reset link sent",
                      description: "Check your email for reset instructions.",
                    });
                  } catch (err: any) {
                    notify({
                      title: "Couldn't send reset",
                      description: err?.message || "Please try again.",
                    });
                  }
                }}
              >
                Forgot password?
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {native ? (
              <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                Google/Apple sign-in is available on web. On iOS, please use
                email/password for now.
              </div>
            ) : null}
            {!native && ENABLE_GOOGLE && (
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full rounded border px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring"
                data-testid="btn-google"
              >
                Continue with Google
              </button>
            )}
            {!native && ENABLE_APPLE && (
              <button
                type="button"
                onClick={handleAppleSignIn}
                disabled={loading}
                className="w-full rounded border px-3 py-2 text-sm font-medium hover:bg-muted focus:outline-none focus:ring inline-flex items-center justify-center gap-2"
                data-testid="btn-apple"
                aria-label="Continue with Apple"
              >
                <AppleIcon />
                Continue with Apple
              </button>
            )}
          </div>
          {authError && lastOAuthProvider ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={() => {
                  if (lastOAuthProvider === "google.com") {
                    void handleGoogleSignIn();
                    return;
                  }
                  if (lastOAuthProvider === "apple.com") {
                    void handleAppleSignIn();
                  }
                }}
              >
                Try again
              </Button>
              <p className="mt-2 text-xs text-muted-foreground text-center">
                If this keeps failing, check your connection or use a different sign-in method.
              </p>
            </div>
          ) : null}
          <div className="mt-6">
            {demoEnabled && !user && (
              <div className="mt-4">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={onBrowseDemo}
                >
                  Just looking? Browse the demo
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  Preview the experience with sample data. Sign up to save your
                  progress.
                </p>
              </div>
            )}
            <div className="mt-4 text-center text-xs text-muted-foreground space-x-2">
              <a href="/privacy" className="underline hover:no-underline">
                Privacy
              </a>
              <span>?</span>
              <a href="/terms" className="underline hover:no-underline">
                Terms
              </a>
            </div>
          </div>
        </CardContent>
      </Card>
    </main>
  );
};

export default Auth;

function normalizeFirebaseError(err: unknown): {
  message?: string;
  code?: string;
} {
  if (!err) return {};
  if (typeof err === "string") {
    return { message: err };
  }
  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    const message =
      typeof record.message === "string" ? record.message : undefined;
    const code = typeof record.code === "string" ? record.code : undefined;
    return { message, code };
  }
  return {};
}

function cleanFirebaseMessage(message?: string): string | undefined {
  if (!message) return undefined;
  let cleaned = message.replace(/^Firebase:\s*/i, "");
  cleaned = cleaned.replace(/\s*\(auth\/[\w-]+\)\.?$/i, "").trim();
  return cleaned || undefined;
}

function formatError(message?: string, code?: string) {
  const cleaned =
    cleanFirebaseMessage(message) ?? message ?? "Firebase sign-in failed.";
  if (code) {
    return `${cleaned} (${code})`;
  }
  return cleaned;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  if (ms <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => {
      const err: any = new Error("Login timed out. Please try again.");
      err.code = "auth/timeout";
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
