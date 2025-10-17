import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Seo } from "@/components/Seo";
import { toast } from "@/hooks/use-toast";
import {
  createAccountEmail,
  rememberAuthRedirect,
  consumeAuthRedirect,
  resolveAuthRedirect,
  sendReset,
  useAuthUser,
  shouldUsePopupAuth,
  formatAuthError,
  finalizeAppleProfile,
  isHostAllowed,
} from "@/lib/auth";
import { auth, safeEmailSignIn } from "@/lib/firebase";
import {
  signInWithPopup,
  signInWithRedirect,
  type Auth as FirebaseAuth,
  type AuthProvider,
  type UserCredential,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth";
import { isIOSSafari } from "@/lib/isIOSWeb";
import { isProviderEnabled, loadFirebaseAuthClientConfig } from "@/lib/firebaseAuthConfig";
import { APPLE_OAUTH_ENABLED, OAUTH_AUTHORIZED_HOSTS } from "@/env";
import { Loader2 } from "lucide-react";

const POPUP_FALLBACK_CODES = new Set([
  "auth/popup-blocked",
  "auth/popup-closed-by-user",
  "auth/operation-not-supported-in-this-environment",
  "auth/network-request-failed",
]);

function normalizeHostCandidate(value?: string | null): string {
  if (!value) return "";
  return value.replace(/^https?:\/\//i, "").split("/")[0]?.split(":")[0]?.trim().toLowerCase() ?? "";
}

function matchesAuthorizedHost(candidate: string, hostname: string): boolean {
  const normalizedCandidate = normalizeHostCandidate(candidate);
  const normalizedHost = normalizeHostCandidate(hostname);
  if (!normalizedCandidate || !normalizedHost) return false;
  if (normalizedCandidate === normalizedHost) return true;
  return normalizedHost.endsWith(`.${normalizedCandidate}`);
}

type ProviderSignInResult =
  | { status: "popup"; credential: UserCredential }
  | { status: "redirect"; credential: null };

async function waitForDomReady(): Promise<void> {
  if (typeof window === "undefined") return;
  if (document.readyState === "complete") return;
  await new Promise<void>((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
  });
}

async function signInWithProvider(
  auth: FirebaseAuth,
  provider: AuthProvider,
  options?: { preferPopup?: boolean; finalize?: (credential: UserCredential | null) => Promise<void> | void },
): Promise<ProviderSignInResult> {
  await waitForDomReady();
  const preferPopup = options?.preferPopup ?? shouldUsePopupAuth();
  if (!preferPopup) {
    await signInWithRedirect(auth, provider);
    return { status: "redirect", credential: null };
  }

  let retriedNetwork = false;
  while (true) {
    try {
      const credential = await signInWithPopup(auth, provider);
      await options?.finalize?.(credential);
      return { status: "popup", credential };
    } catch (error: any) {
      const code = typeof error?.code === "string" ? error.code : "";
      if (code === "auth/network-request-failed" && !retriedNetwork) {
        retriedNetwork = true;
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
      if (!code || !POPUP_FALLBACK_CODES.has(code)) {
        throw error;
      }
      break;
    }
  }

  await signInWithRedirect(auth, provider);
  return { status: "redirect", credential: null };
}

const AppleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 14 17" width="16" height="16" aria-hidden="true" {...props}>
    <path d="M10.24 9.1c.01 2.16 1.86 2.88 1.88 2.89-.01.04-.3 1.03-1 2.03-.6.86-1.23 1.72-2.22 1.74-.97.02-1.28-.56-2.38-.56-1.1 0-1.44.54-2.35.58-.94.04-1.66-.93-2.27-1.79C.68 12.5-.2 10 0 7.66c.13-1.26.73-2.43 1.7-3.11.75-.51 1.67-.73 2.56-.6.6.12 1.1.36 1.48.56.38.2.68.37.88.36.18 0 .5-.18.88-.37.53-.28 1.13-.6 1.93-.6.01 0 .01 0 .02 0 .72.01 2.26.18 3.33 1.77-.09.06-1.98 1.15-1.93 3.43ZM7.3 1.62C7.9.88 8.97.33 9.88.32c.1.98-.29 1.96-.87 2.64C8.4 3.7 7.39 4.28 6.37 4.2c-.1-.96.4-1.98.93-2.58Z" fill="currentColor"/>
  </svg>
);

const GoogleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}>
    <path
      d="M12.24 10.32v3.44h4.76c-.2 1.11-1.44 3.27-4.76 3.27-2.86 0-5.2-2.37-5.2-5.28s2.34-5.28 5.2-5.28c1.63 0 2.72.69 3.35 1.28l2.28-2.2C16.72 4.34 14.7 3.4 12.24 3.4 7.7 3.4 4 7.05 4 11.75S7.7 20.1 12.24 20.1c4.32 0 7.18-3.03 7.18-7.31 0-.49-.05-.86-.11-1.24Z"
      fill="currentColor"
    />
  </svg>
);

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from || "/today";
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [appleEnabled, setAppleEnabled] = useState<boolean | null>(null);
  const forceAppleButton = import.meta.env.VITE_FORCE_APPLE_BUTTON === "true";
  const [providerLoading, setProviderLoading] = useState<null | "google" | "apple">(null);
  const [lastOauthError, setLastOauthError] = useState<
    | { provider: string; code?: string; message: string }
    | null
  >(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [hostAuthorized, setHostAuthorized] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return isHostAllowed(window.location.hostname);
  });
  const appleFeatureEnabled = APPLE_OAUTH_ENABLED;
  const { user } = useAuthUser();
  const authDisabled = !hostAuthorized;

  useEffect(() => {
    if (!user) return;
    const defaultTarget = (location.state as any)?.from || "/today";
    if (location.pathname !== defaultTarget) {
      navigate(defaultTarget, { replace: true });
    }
  }, [user, navigate, location.pathname, location.state]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hostname = window.location.hostname;
    if (isHostAllowed(hostname)) {
      setHostAuthorized(true);
      return;
    }
    const oauthAuthorized = (OAUTH_AUTHORIZED_HOSTS ?? []).some((candidate) =>
      matchesAuthorizedHost(candidate, hostname),
    );
    setHostAuthorized(oauthAuthorized);
  }, []);

  useEffect(() => {
    let active = true;
    loadFirebaseAuthClientConfig()
      .then((config) => {
        if (!active) return;
        setAppleEnabled(isProviderEnabled("apple.com", config));
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.warn("[auth] Unable to determine Apple availability:", err);
        }
        if (active) {
          setAppleEnabled(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const handleOauthError = (providerLabel: string, error: any) => {
    const code = typeof error?.code === "string" ? error.code : undefined;
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    if (code === "auth/unauthorized-domain") {
      const guidanceHost = hostname || "this domain";
      const description = `Add ${guidanceHost} to Firebase > Auth > Settings > Authorized domains, then retry. (${code})`;
      toast({ title: "Authorize this domain", description });
      setLastOauthError({ provider: providerLabel, code, message: description });
      return;
    }
    const formatted = formatAuthError(providerLabel, error);
    toast({ title: `${providerLabel} sign-in failed`, description: formatted });
    setLastOauthError({ provider: providerLabel, code, message: formatted });
  };

  useEffect(() => {
    if (authDisabled) {
      return () => {
        /* noop */
      };
    }
    let active = true;
    resolveAuthRedirect(auth)
      .then((result) => {
        if (!active || !result) return;
        setLastOauthError(null);
        const target = consumeAuthRedirect();
        if (target) {
          navigate(target, { replace: true });
        }
      })
      .catch((err: any) => {
        if (!active) return;
        consumeAuthRedirect();
        handleOauthError("Sign-in", err);
      });
    return () => {
      active = false;
    };
  }, [navigate, authDisabled]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authDisabled) {
      setFormError("Sign-in is disabled on this domain.");
      return;
    }
    setFormError(null);
    setLoading(true);
    try {
      if (mode === "signin") {
        await safeEmailSignIn(email, password);
      } else {
        await createAccountEmail(email, password);
      }
      navigate(from, { replace: true });
    } catch (err: any) {
      const code = err?.code ?? "unknown";
      const message = err?.message ?? "Unknown error";
      const prefix = mode === "signin" ? "Sign-in failed" : "Create account failed";
      setFormError(`${prefix} (${code}). ${message}`);
      console.error("Sign-in error:", err);
      if (mode === "signup") {
        toast({
          title: "Create account failed",
          description: formatAuthError("Email", err),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const onGoogle = async () => {
    if (loading) return;
    if (authDisabled) {
      toast({
        title: "Sign-in blocked",
        description: "This domain isn’t authorized for Google sign-in.",
      });
      return;
    }
    setLoading(true);
    setProviderLoading("google");
    setLastOauthError(null);
    try {
      rememberAuthRedirect(from);
      const authInstance = auth;
      const googleProvider = new GoogleAuthProvider();
      googleProvider.setCustomParameters?.({ prompt: "select_account" });
      const result = await signInWithProvider(authInstance, googleProvider, {
        preferPopup: shouldUsePopupAuth(),
      });
      if (result.status === "popup") {
        consumeAuthRedirect();
        setLastOauthError(null);
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      consumeAuthRedirect();
      console.error("Google sign-in failed:", err);
      handleOauthError("Google", err);
    } finally {
      setProviderLoading(null);
      setLoading(false);
    }
  };

  const appleConfigured = appleEnabled === true;
  const showAppleButton = appleFeatureEnabled && (forceAppleButton || appleEnabled !== false);

  const handleAppleFeatureDisabled = () => {
    const message = "Apple Sign-In not yet enabled for this domain. Flip APPLE_OAUTH_ENABLED to true after finishing setup.";
    toast({ title: "Apple Sign-In not yet enabled for this domain", description: message });
    setLastOauthError({ provider: "Apple", code: "apple/feature-disabled", message });
  };

  const showAppleNotConfigured = () => {
    const message = "Apple Sign-In not yet enabled for this domain. Enable the Apple provider in Firebase Auth before retrying.";
    toast({ title: "Apple Sign-In not yet enabled for this domain", description: message });
    setLastOauthError({ provider: "Apple", code: "apple/not-configured", message });
  };

  const isAppleMisconfiguredError = (error: any) => {
    const code = String(error?.code || "");
    if (
      code.includes("operation-not-allowed") ||
      code.includes("configuration-not-found") ||
      code.includes("invalid-oauth-provider") ||
      code.includes("invalid-oauth-client-id") ||
      code.includes("invalid-provider-id")
    ) {
      return true;
    }
    const message = String(error?.message || "");
    return /CONFIGURATION_NOT_FOUND|not enabled|disabled/i.test(message);
  };

  const onApple = async () => {
    if (loading) return;

    if (authDisabled) {
      toast({
        title: "Sign-in blocked",
        description: "This domain isn’t authorized for Apple sign-in.",
      });
      return;
    }

    if (!appleFeatureEnabled) {
      handleAppleFeatureDisabled();
      return;
    }

    if (!appleConfigured && appleEnabled === false) {
      showAppleNotConfigured();
      return;
    }

    setLoading(true);
    setProviderLoading("apple");
    setLastOauthError(null);
    try {
      rememberAuthRedirect(from);
      const authInstance = auth;
      const appleProvider = new OAuthProvider("apple.com");
      appleProvider.addScope("email");
      appleProvider.addScope("name");
      const preferPopup = shouldUsePopupAuth() && !isIOSSafari();
      const result = await signInWithProvider(authInstance, appleProvider, {
        preferPopup,
        finalize: finalizeAppleProfile,
      });
      if (result.status === "popup") {
        consumeAuthRedirect();
        setLastOauthError(null);
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      consumeAuthRedirect();
      if (isAppleMisconfiguredError(err)) {
        showAppleNotConfigured();
      } else {
        console.error("Apple sign-in failed:", err);
        handleOauthError("Apple", err);
      }
    } finally {
      setProviderLoading(null);
      setLoading(false);
    }
  };

  const appleHelperMessage = !appleFeatureEnabled
    ? "Apple Sign-In is disabled here until APPLE_OAUTH_ENABLED is set to true."
    : !appleConfigured && appleEnabled === false
    ? "Finish the Apple provider setup in Firebase Auth (service ID, redirect URL, key) before enabling users."
    : null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <Seo title="Sign In – MyBodyScan" description="Access your MyBodyScan account to start and review scans." canonical={window.location.href} />
      <div className="w-full max-w-md">
        {!hostAuthorized && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This domain isn’t in Firebase Authorized Domains. OAuth popups may be blocked.
          </div>
        )}
        <Card className="w-full shadow-md">
          <CardHeader>
          <div className="text-center">
            <CardTitle className="text-2xl mb-2">{mode === "signin" ? "Welcome back" : "Create your account"}</CardTitle>
            <CardDescription className="text-slate-600">Track body fat, weight and progress—private and secure.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center gap-2 mb-4">
            <Button size="sm" variant={mode === "signin" ? "default" : "outline"} onClick={() => setMode("signin")}>
              Sign in
            </Button>
            <Button size="sm" variant={mode === "signup" ? "default" : "outline"} onClick={() => setMode("signup")}>
              Create account
            </Button>
          </div>

          <div className="mb-4 p-4 bg-slate-50 rounded-lg">
            <div className="space-y-2 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Accurate body fat estimates from photos/video</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Progress tracking & reminders</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Private by default—your data, your control</span>
              </div>
            </div>
          </div>

          {formError ? (
            <div
              className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
              role="alert"
            >
              {formError}
            </div>
          ) : null}

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <div className="flex flex-col gap-2">
              <Button type="submit" className="mbs-btn mbs-btn-primary w-full" disabled={loading || authDisabled}>
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
                disabled={loading || authDisabled}
                onClick={async () => {
                  if (authDisabled) {
                    toast({
                      title: "Reset unavailable",
                      description: "This domain isn’t authorized for account actions.",
                    });
                    return;
                  }
                  try {
                    await sendReset(email);
                    toast({ title: "Reset link sent", description: "Check your email for reset instructions." });
                  } catch (err: any) {
                    toast({ title: "Couldn't send reset", description: err?.message || "Please try again." });
                  }
                }}
              >
                Forgot password?
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {showAppleButton ? (
              <div className="space-y-2" data-testid="auth-apple-button-wrapper">
                <Button
                  variant="secondary"
                  onClick={onApple}
                  disabled={loading || authDisabled}
                  className="w-full h-11 inline-flex items-center justify-center gap-2"
                  aria-label="Continue with Apple"
                  data-testid="auth-apple-button"
                >
                  {providerLoading === "apple" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <AppleIcon className="h-4 w-4" />
                  )}
                  <span>Continue with Apple</span>
                </Button>
                {appleHelperMessage ? (
                  <p className="text-xs text-muted-foreground text-center">{appleHelperMessage}</p>
                ) : null}
              </div>
            ) : null}
            <Button
              variant="secondary"
              onClick={onGoogle}
              disabled={loading || authDisabled}
              className="w-full h-11 inline-flex items-center justify-center gap-2"
              data-testid="auth-google-button"
            >
              {providerLoading === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <GoogleIcon className="h-4 w-4" />
              )}
              <span>Continue with Google</span>
            </Button>
          </div>
          <Collapsible open={supportOpen} onOpenChange={setSupportOpen} className="mt-2">
            <div className="text-center">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline hover:text-primary focus:outline-none"
                >
                  Having trouble?
                </button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-2 text-xs text-muted-foreground space-y-2">
              {lastOauthError ? (
                <div className="rounded-md border border-muted bg-muted/40 p-3 text-left">
                  <p className="font-medium text-foreground">{lastOauthError.provider} sign-in details</p>
                  <p className="mt-1 break-words">{lastOauthError.message}</p>
                  {lastOauthError.code ? (
                    <p className="mt-1 font-mono text-[11px] uppercase text-muted-foreground">{lastOauthError.code}</p>
                  ) : null}
                </div>
              ) : (
                <p>No recent OAuth errors. We’ll surface details here if a provider fails.</p>
              )}
            </CollapsibleContent>
          </Collapsible>
          <div className="mt-6">
            <Button type="button" variant="ghost" className="w-full" asChild>
              <Link to="/demo">👀 Explore demo (no sign-up)</Link>
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Browse demo data. Create a free account to unlock scanning and save your progress.
            </p>
            <div className="mt-4 text-center text-xs text-muted-foreground space-x-2">
              <a href="/privacy" className="underline hover:no-underline">Privacy</a>
              <span>·</span>
              <a href="/terms" className="underline hover:no-underline">Terms</a>
            </div>
          </div>
        </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default Auth;

