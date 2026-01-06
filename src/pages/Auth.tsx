import { useState, useEffect, useCallback, useMemo } from "react";
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
import { createAccountEmail, sendReset, useAuthUser } from "@/lib/auth";
import { signInApple as startAppleSignIn, signInGoogle as startGoogleSignIn } from "@/lib/authFacade";
import {
  auth,
  firebaseConfigMissingKeys,
  firebaseConfigWarningKeys,
  getFirebaseInitError,
  hasFirebaseConfig,
  requireAuth,
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

const ENABLE_GOOGLE = (import.meta as any).env?.VITE_ENABLE_GOOGLE !== "false";
const ENABLE_APPLE = (import.meta as any).env?.VITE_ENABLE_APPLE !== "false";

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
  const defaultTarget = nextParam || from || "/home";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [lastOAuthProvider, setLastOAuthProvider] =
    useState<("google.com" | "apple.com") | null>(null);
  const [configDetailsOpen, setConfigDetailsOpen] = useState(false);
  const [identityProbe, setIdentityProbe] =
    useState<IdentityToolkitProbeStatus | null>(() =>
      getIdentityToolkitProbeStatus()
    );
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
    if (!user) return;
    disableDemoEverywhere();
    if (location.pathname !== defaultTarget) {
      window.location.replace(defaultTarget);
    }
  }, [user, location.pathname, defaultTarget]);

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
      setLastOAuthProvider(pending.providerId);
      const elapsed = Date.now() - pending.startedAt;
      const remaining = Math.max(0, 15_000 - elapsed);
      if (remaining === 0) {
        clearPendingOAuth();
        const message = "Sign-in timed out. Please try again.";
        setAuthError(message);
        toast(message, "error");
        return;
      }
      setLoading(true);
      const timer = window.setTimeout(() => {
        clearPendingOAuth();
        setLoading(false);
        const message = "Sign-in timed out. Please try again.";
        setAuthError(message);
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
      setAuthError(message);
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
    const authOptions = (auth?.app?.options ?? {}) as Record<string, unknown>;
    void reportError({
      kind: "auth_origin_check",
      message: "auth_origin_check",
      extra: {
        origin,
        authDomain: (authOptions.authDomain as string) || null,
        projectId: (authOptions.projectId as string) || null,
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

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // IMPORTANT: Firebase config warnings should never block sign-in attempts.
    // If Auth is misconfigured, the sign-in call will fail and we show a friendly error.
    setLoading(true);
    try {
      setAuthError(null);
      if (mode === "signin") {
        const authClient = await requireAuth();
        try {
          const { signInWithEmailAndPassword } = await import("firebase/auth");
          await signInWithEmailAndPassword(authClient, email, password);
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

          let uiMessage = "Sign-in failed. Please try again.";

          switch (code) {
            case "auth/network-request-failed":
              uiMessage =
                "Network error contacting Auth. Please check your connection and try again.";
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
            case "auth/operation-not-allowed":
              uiMessage =
                "Sign-in is not enabled for this project. Contact support.";
              break;
            default:
              console.error("[Auth] Unhandled sign-in error", error);
              break;
          }

          const emailLower = email.trim().toLowerCase();
          const isAdminDev = emailLower === "developer@adlrlabs.com";
          const debugSuffix = isAdminDev ? ` [debug: ${code}]` : "";

          setAuthError(`${uiMessage}${debugSuffix}`);
          return;
        }
      } else {
        await createAccountEmail(email, password);
      }
    } catch (err: unknown) {
      const normalized = normalizeFirebaseError(err);
      const fallback =
        mode === "signin"
          ? "Email sign-in failed."
          : "Account creation failed.";
      const message = formatError(
        normalized.message ?? fallback,
        normalized.code
      );
      setAuthError(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = useCallback(async () => {
    if (native) {
      setAuthError(
        "Google sign-in is available on web. On iOS, please use email/password for now."
      );
      return;
    }
    setAuthError(null);
    setLoading(true);
    setLastOAuthProvider("google.com");
    try {
      await startGoogleSignIn(defaultTarget);
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
      setAuthError(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [defaultTarget, native]);

  const handleAppleSignIn = useCallback(async () => {
    if (native) {
      setAuthError(
        "Apple sign-in is available on web. On iOS, please use email/password for now."
      );
      return;
    }
    setAuthError(null);
    setLoading(true);
    setLastOAuthProvider("apple.com");
    try {
      await startAppleSignIn(defaultTarget);
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
      setAuthError(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }, [defaultTarget, native]);

  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const origin =
    typeof window !== "undefined" ? window.location.origin : "(unknown)";
  const authOptions = (auth?.app?.options ?? {}) as Record<string, unknown>;
  const showDebugPanel =
    import.meta.env.DEV ||
    host.startsWith("localhost") ||
    user?.email === "developer@adlrlabs.com";
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
            <CardTitle className="text-2xl mb-2">
              {mode === "signin" ? "Welcome back" : "Create your account"}
            </CardTitle>
            <CardDescription className="text-slate-600">
              Track body fat, weight and progress — private and secure.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {showDebugPanel && (
            <div className="mb-2 flex justify-end">
              <Button
                type="button"
                size="xs"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => setConfigDetailsOpen((open) => !open)}
              >
                {configDetailsOpen
                  ? "Hide config status"
                  : "Show config status"}
              </Button>
            </div>
          )}
          {configDetailsOpen && showDebugPanel && (
            <div
              className={`mb-3 rounded-md border p-3 text-xs ${
                configStatus.tone === "warning"
                  ? "border-amber-300 bg-amber-50 text-amber-900"
                  : configStatus.tone === "ok"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                    : "border-muted bg-muted/30 text-muted-foreground"
              }`}
            >
              <div className="font-semibold text-sm">
                {configStatus.tone === "warning"
                  ? "Config warning"
                  : "Config status"}
              </div>
              <div className="mt-1">{configStatus.message}</div>
              {identityProbe?.status === "warning" && (
                <div className="mt-1 text-[11px] text-amber-800">
                  IdentityToolkit clientConfig returned a warning (404/403).
                  Login continues; add this origin to Firebase Auth authorized
                  domains if needed.
                </div>
              )}
              {identityProbe == null && (
                <div className="mt-1 text-[11px] text-muted-foreground">
                  Probing runtime configuration…
                </div>
              )}
            </div>
          )}
          {firebaseInitError && (
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
            {showDebugPanel && (
              <div className="mt-6 rounded-lg border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground space-y-1">
                <div className="font-semibold text-xs text-foreground">
                  Debug info
                </div>
                <div>Origin: {origin}</div>
                <div>
                  Project ID: {(authOptions.projectId as string) || "(unknown)"}
                </div>
                <div>
                  Auth domain:{" "}
                  {(authOptions.authDomain as string) || "(unknown)"}
                </div>
                <div>Has config: {String(hasFirebaseConfig)}</div>
                <div>
                  Missing config:{" "}
                  {firebaseConfigMissingKeys.length
                    ? firebaseConfigMissingKeys.join(", ")
                    : "none"}
                </div>
                <div>
                  Optional missing:{" "}
                  {firebaseConfigWarningKeys.length
                    ? firebaseConfigWarningKeys.join(", ")
                    : "none"}
                </div>
                <div>
                  IdentityToolkit probe: {identityProbe?.status || "pending"}
                  {identityProbe?.statusCode
                    ? ` (${identityProbe.statusCode})`
                    : ""}
                </div>
                <div>
                  Current user: {auth?.currentUser?.email || "(none)"} · UID:{" "}
                  {auth?.currentUser?.uid || "-"}
                </div>
                <div>
                  Last auth error: {authError || firebaseInitError || "none"}
                </div>
              </div>
            )}
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
